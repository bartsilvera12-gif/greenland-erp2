import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { requireApiKey } from "@/lib/public-api/api-key";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * POST /api/bancard/pagos/reversa
 *
 * Anula un pago previamente aplicado y restablece el saldo de la cuenta.
 *
 * Headers:
 *   X-Api-Key:     <EXTERNAL_PAYMENT_API_KEY>
 *   X-Partner-Id:  bancard
 *   Content-Type:  application/json
 *
 * Body JSON:
 *   { "transaccion_id": "EXT-12345" }
 *
 * Respuestas:
 *   200 success → { transaccion_id, cuenta_id, saldo_restablecido, estado_cuenta, reversed_at }
 *   200 ya reversado (idempotente) → mismo shape con `ya_reversado: true`
 *   401 → API key inválida
 *   404 → transaccion_id no existe para este partner
 */
export async function POST(request: NextRequest) {
  const auth = requireApiKey(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> | null = null;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return corsJson({ success: false, error: "JSON inválido" }, { status: 400 }); }
  if (!body) return corsJson({ success: false, error: "Body vacío" }, { status: 400 });

  const transaccionId = typeof body.transaccion_id === "string" ? body.transaccion_id.trim().slice(0, 80) : "";
  if (!transaccionId) return corsJson({ success: false, error: "transaccion_id requerido" }, { status: 400 });

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

  // 1) Buscar el pago externo
  const { data: pagoRaw } = await supabase
    .from("pagos_externos")
    .select("id, cuenta_id, cobro_id, monto, estado, reversed_at")
    .eq("empresa_id", empresaId)
    .eq("partner_id", auth.partner_id)
    .eq("transaccion_id", transaccionId)
    .maybeSingle();

  if (!pagoRaw) return corsJson({ success: false, error: "transaccion_id no encontrado" }, { status: 404 });
  const pago = pagoRaw as { id: string; cuenta_id: string; cobro_id: string | null; monto: number; estado: string; reversed_at: string | null };

  if (pago.estado === "reversado") {
    return corsJson({
      success: true,
      ya_reversado: true,
      data: { transaccion_id: transaccionId, cuenta_id: pago.cuenta_id, reversed_at: pago.reversed_at },
    });
  }

  // 2) Borrar el cobro original
  if (pago.cobro_id) {
    const delC = await supabase
      .from("cobros_clientes")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("id", pago.cobro_id);
    if (delC.error) return corsJson({ success: false, error: `Error al borrar cobro: ${delC.error.message}` }, { status: 500 });
  }

  // 3) Restaurar saldo y estado en cuentas_por_cobrar
  const { data: cuentaRaw } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, total, saldo")
    .eq("empresa_id", empresaId)
    .eq("id", pago.cuenta_id)
    .maybeSingle();

  if (!cuentaRaw) return corsJson({ success: false, error: "cuenta no encontrada" }, { status: 404 });
  const cuenta = cuentaRaw as { id: string; total: number; saldo: number };
  const total = Number(cuenta.total) || 0;
  const saldoActual = Number(cuenta.saldo) || 0;
  const saldoNuevo = Math.min(total, saldoActual + Number(pago.monto));
  const estadoNuevo = saldoNuevo <= 0.001 ? "pagado" : saldoNuevo < total ? "parcial" : "pendiente";

  const updC = await supabase
    .from("cuentas_por_cobrar")
    .update({ saldo: saldoNuevo, estado: estadoNuevo, updated_at: new Date().toISOString() })
    .eq("empresa_id", empresaId)
    .eq("id", pago.cuenta_id);
  if (updC.error) return corsJson({ success: false, error: `Error al actualizar saldo: ${updC.error.message}` }, { status: 500 });

  // 4) Marcar pago externo como reversado
  const reversedAt = new Date().toISOString();
  await supabase
    .from("pagos_externos")
    .update({ estado: "reversado", reversed_at: reversedAt, cobro_id: null })
    .eq("id", pago.id);

  return corsJson({
    success: true,
    data: {
      transaccion_id: transaccionId,
      cuenta_id: pago.cuenta_id,
      saldo_restablecido: saldoNuevo,
      estado_cuenta: estadoNuevo,
      reversed_at: reversedAt,
    },
  });
}
