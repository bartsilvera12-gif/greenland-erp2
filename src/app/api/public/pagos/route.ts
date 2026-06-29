import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { requireApiKey, clientIp } from "@/lib/public-api/api-key";
import { registrarCobro } from "@/lib/cobros/server/cobros-pg";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * POST /api/public/pagos
 *
 * Aplica un pago externo (Pago Express / Aqui Pago / etc.) contra una cuota.
 * Idempotente por `transaccion_id` del partner.
 *
 * Headers:
 *   X-Api-Key: <EXTERNAL_PAYMENT_API_KEY>
 *   X-Partner-Id: <opcional, ej "pago-express">
 *
 * Body JSON:
 *   {
 *     "transaccion_id": "EXT-12345",          // requerido, idempotency key
 *     "numero_venta":   "VTA-20260629-001-C5", // requerido, numero de la cuota
 *     "monto":          1500000,               // requerido, > 0
 *     "moneda":         "GS",                  // opcional, default GS
 *     "fecha_pago":     "2026-06-29T15:30:00Z",// opcional, default now
 *     "metodo":         "transferencia",       // opcional: efectivo|transferencia|tarjeta|otro
 *     "referencia":     "Lote A · Cuota 5"     // opcional
 *   }
 *
 * Respuestas:
 *   200 success → { transaccion_id, cuenta_id, cobro_id, saldo_restante, estado_cuenta, applied_at }
 *   200 success ya aplicado (idempotente) → mismo shape con flag `ya_aplicado: true`
 *   400 → falta dato / monto inválido / cuenta anulada/pagada
 *   401 → API key inválida
 *   404 → cuota no encontrada
 *   409 → mismo transaccion_id ya existe pero contra otra cuenta/monto
 */
export async function POST(request: NextRequest) {
  const auth = requireApiKey(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return corsJson({ success: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!body) return corsJson({ success: false, error: "Body vacío" }, { status: 400 });

  const transaccionId = typeof body.transaccion_id === "string" ? body.transaccion_id.trim().slice(0, 80) : "";
  const numeroVenta = typeof body.numero_venta === "string" ? body.numero_venta.trim().slice(0, 120) : "";
  const monto = Number(body.monto);
  const moneda = typeof body.moneda === "string" && body.moneda.toUpperCase() === "USD" ? "USD" : "GS";
  const fechaPago = typeof body.fecha_pago === "string" ? body.fecha_pago : new Date().toISOString();
  const metodo = typeof body.metodo === "string" ? body.metodo : "transferencia";
  const referencia = typeof body.referencia === "string" ? body.referencia.slice(0, 200) : null;

  if (!transaccionId) return corsJson({ success: false, error: "transaccion_id requerido" }, { status: 400 });
  if (!numeroVenta) return corsJson({ success: false, error: "numero_venta requerido" }, { status: 400 });
  if (!Number.isFinite(monto) || monto <= 0) return corsJson({ success: false, error: "monto inválido" }, { status: 400 });

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

  // 1) Idempotencia: si ya existe un pago aplicado con ese transaccion_id, devolverlo.
  const { data: dup } = await supabase
    .from("pagos_externos")
    .select("id, cuenta_id, cobro_id, monto, numero_venta, estado, applied_at")
    .eq("empresa_id", empresaId)
    .eq("partner_id", auth.partner_id)
    .eq("transaccion_id", transaccionId)
    .maybeSingle();

  if (dup) {
    const d = dup as { id: string; cuenta_id: string; cobro_id: string | null; monto: number | string; numero_venta: string | null; estado: string; applied_at: string };
    // Si vino con datos distintos a los originales, es ambiguo → 409.
    if (Number(d.monto) !== monto || (d.numero_venta && d.numero_venta !== numeroVenta)) {
      return corsJson(
        { success: false, error: "transaccion_id ya existe con otros datos", existente: { numero_venta: d.numero_venta, monto: d.monto } },
        { status: 409 },
      );
    }
    if (d.estado === "reversado") {
      return corsJson({ success: false, error: "transacción reversada — generá un transaccion_id nuevo" }, { status: 409 });
    }
    // Ya aplicado: devolver respuesta idempotente
    const { data: cuenta } = await supabase
      .from("cuentas_por_cobrar")
      .select("saldo, estado")
      .eq("empresa_id", empresaId)
      .eq("id", d.cuenta_id)
      .maybeSingle();
    const c = cuenta as { saldo: number | string; estado: string } | null;
    return corsJson({
      success: true,
      ya_aplicado: true,
      data: {
        transaccion_id: transaccionId,
        cuenta_id: d.cuenta_id,
        cobro_id: d.cobro_id,
        monto: Number(d.monto),
        saldo_restante: c ? Number(c.saldo) : null,
        estado_cuenta: c?.estado ?? null,
        applied_at: d.applied_at,
      },
    });
  }

  // 2) Buscar la cuenta por numero_venta
  const { data: cxcRaw, error: errCxc } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, cliente_id, venta_id, total, saldo, estado")
    .eq("empresa_id", empresaId)
    .eq("numero_venta", numeroVenta)
    .maybeSingle();
  if (errCxc) return corsJson({ success: false, error: errCxc.message }, { status: 400 });
  if (!cxcRaw) return corsJson({ success: false, error: "cuota no encontrada" }, { status: 404 });
  const cxc = cxcRaw as { id: string; cliente_id: string; venta_id: string; total: number; saldo: number; estado: string };

  if (cxc.estado === "anulado") return corsJson({ success: false, error: "cuenta anulada" }, { status: 400 });
  if (Number(cxc.saldo) <= 0) return corsJson({ success: false, error: "cuenta ya pagada" }, { status: 400 });
  if (monto > Number(cxc.saldo) + 0.001) {
    return corsJson({ success: false, error: `monto (${monto}) supera saldo pendiente (${cxc.saldo})` }, { status: 400 });
  }

  // 3) Aplicar el cobro reusando la lógica del módulo Pagos
  let result: { cobro_id: string; saldo_nuevo: number; estado: string };
  try {
    result = await registrarCobro(supabase, empresaId, {
      cuenta_por_cobrar_id: cxc.id,
      monto,
      metodo_pago: metodo === "efectivo" || metodo === "transferencia" || metodo === "tarjeta" ? metodo : "otro",
      referencia: referencia ?? `${auth.partner_id}:${transaccionId}`,
      fecha_pago: fechaPago,
      usuario_nombre: `Pago externo · ${auth.partner_id}`,
      observaciones: `transaccion_id=${transaccionId}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al aplicar pago";
    return corsJson({ success: false, error: msg }, { status: 500 });
  }

  // 4) Log en pagos_externos (best-effort: si falla, ya cobró pero no quedó log → riesgo de duplicado en reintento)
  await supabase
    .from("pagos_externos")
    .insert({
      empresa_id: empresaId,
      partner_id: auth.partner_id,
      transaccion_id: transaccionId,
      cuenta_id: cxc.id,
      numero_venta: numeroVenta,
      cobro_id: result.cobro_id,
      monto,
      moneda,
      estado: "aplicado",
      metodo_pago: metodo,
      referencia,
      applied_at: fechaPago,
      raw_request: body,
      ip: clientIp(request),
    });

  return corsJson({
    success: true,
    data: {
      transaccion_id: transaccionId,
      cuenta_id: cxc.id,
      cobro_id: result.cobro_id,
      monto,
      saldo_restante: result.saldo_nuevo,
      estado_cuenta: result.estado,
      applied_at: fechaPago,
    },
  });
}
