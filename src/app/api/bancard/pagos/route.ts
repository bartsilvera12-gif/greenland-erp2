import { NextRequest } from "next/server";
import { corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { registrarCobro } from "@/lib/cobros/server/cobros-pg";
import { bancardJson, parseTid, parseTrnDat, asStringList, type BancardMessage } from "@/lib/bancard/format";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * POST /api/bancard/pagos
 *
 * Cumple con la spec Bancard "Realizar un pago".
 * Idempotente por `tid` (identificador de la transacción del partner).
 *
 * Body JSON (según PDF):
 *   {
 *     "tid":     3950,
 *     "prd_id":  1,
 *     "sub_id":  ["1234567"],
 *     "inv_id":  ["BNC-TEST-JUAN-C2"],
 *     "amt":     1500000,
 *     "curr":    "PYG",
 *     "trn_dat": "20260629",
 *     "trn_hou": "153000",
 *     "cm_amt":  0,
 *     "cm_curr": "PYG",
 *     "addl":    { ... }
 *   }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | null = null;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return bancardJson(0, "error", [msg("error", "InvalidParameters", "JSON inválido")], undefined, 422); }
  if (!body) return bancardJson(0, "error", [msg("error", "InvalidParameters", "Body vacío")], undefined, 422);

  const tid = parseTid(body.tid);
  if (tid === null) {
    return bancardJson(0, "error", [msg("error", "MissingParameter", "tid requerido")], undefined, 403);
  }

  const subIds = asStringList(body.sub_id);
  const invIds = asStringList(body.inv_id);
  const amt = Number(body.amt);
  const curr = typeof body.curr === "string" && body.curr.toUpperCase() === "USD" ? "USD" : "PYG";

  if (subIds.length === 0) return bancardJson(tid, "error", [msg("error", "MissingParameter", "sub_id requerido")], undefined, 403);
  if (invIds.length === 0) return bancardJson(tid, "error", [msg("error", "MissingParameter", "inv_id requerido")], undefined, 403);
  if (!Number.isFinite(amt) || amt <= 0) {
    return bancardJson(tid, "error", [msg("error", "InvalidParameters", "amt inválido")], undefined, 422);
  }

  const documento = subIds[0]!;
  const numeroVenta = invIds[0]!;

  const trnDatISO = parseTrnDat(body.trn_dat) ?? new Date().toISOString().slice(0, 10);
  const trnHou = typeof body.trn_hou === "string" ? body.trn_hou.padStart(6, "0") : "000000";
  const appliedAtIso = `${trnDatISO}T${trnHou.slice(0, 2)}:${trnHou.slice(2, 4)}:${trnHou.slice(4, 6)}Z`;

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) {
    return bancardJson(tid, "error", [msg("error", "HostTransactionError", "empresa no resuelta")], undefined, 403);
  }

  // Partner_id fijo para el nuevo formato Bancard. Idempotencia por (partner_id, tid).
  const partnerId = "bancard";
  const tidStr = String(tid);

  // ── 1) Idempotencia: si ya existe un pago aplicado con ese tid, devolver éxito ──
  const { data: dup } = await supabase
    .from("pagos_externos")
    .select("id, cuenta_id, cobro_id, monto, numero_venta, estado, applied_at")
    .eq("empresa_id", empresaId)
    .eq("partner_id", partnerId)
    .eq("transaccion_id", tidStr)
    .maybeSingle();

  if (dup) {
    const d = dup as { id: string; cuenta_id: string; cobro_id: string | null; monto: number | string; numero_venta: string | null; estado: string; applied_at: string };
    if (d.estado === "reversado") {
      return bancardJson(tid, "error", [msg("error", "PaymentNotAuthorized", "Transacción previamente reversada. Generá un tid nuevo.")], undefined, 403);
    }
    if (Number(d.monto) !== amt || (d.numero_venta && d.numero_venta !== numeroVenta)) {
      return bancardJson(tid, "error", [msg("error", "InvalidParameters", "tid ya existe con otros datos")], undefined, 422);
    }
    // Idempotente: devolver éxito con el aut_cod original
    return bancardJson(
      tid,
      "success",
      [msg("success", "PaymentProcessed", "El pago ya fue autorizado previamente (idempotente)")],
      {
        tkt: d.id,
        aut_cod: d.cobro_id ?? d.id,
        prnt_msg: buildPrintMsg(documento, numeroVenta, amt, curr, d.applied_at),
      },
      200,
    );
  }

  // ── 2) Buscar la cuota ──
  const { data: cxcRaw } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, cliente_id, venta_id, total, saldo, estado, fecha_vencimiento")
    .eq("empresa_id", empresaId)
    .eq("numero_venta", numeroVenta)
    .maybeSingle();

  if (!cxcRaw) {
    return bancardJson(tid, "error", [msg("error", "SubscriberWithoutDebt", `No se encontró cuota ${numeroVenta}`)], undefined, 403);
  }
  const cxc = cxcRaw as { id: string; cliente_id: string; venta_id: string; total: number; saldo: number; estado: string; fecha_vencimiento: string | null };

  if (cxc.estado === "anulado" || Number(cxc.saldo) <= 0) {
    return bancardJson(tid, "error", [msg("error", "SubscriberWithoutDebt", "La cuota no tiene deuda pendiente")], undefined, 403);
  }
  if (amt > Number(cxc.saldo) + 0.001) {
    return bancardJson(tid, "error", [msg("error", "InvalidParameters", `amt (${amt}) supera saldo pendiente (${cxc.saldo})`)], undefined, 422);
  }

  // ── 3) Aplicar el cobro ──
  let result: { cobro_id: string; saldo_nuevo: number; estado: string };
  try {
    result = await registrarCobro(supabase, empresaId, {
      cuenta_por_cobrar_id: cxc.id,
      monto: amt,
      metodo_pago: "transferencia",
      referencia: `bancard:tid=${tidStr}`,
      fecha_pago: appliedAtIso,
      usuario_nombre: "Bancard",
      observaciones: `tid=${tidStr} · sub_id=${documento} · inv_id=${numeroVenta}`,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Error al aplicar pago";
    return bancardJson(tid, "error", [msg("error", "HostTransactionError", errMsg)], undefined, 403);
  }

  // ── 4) Log de pago externo (idempotency table) ──
  await supabase
    .from("pagos_externos")
    .insert({
      empresa_id: empresaId,
      partner_id: partnerId,
      transaccion_id: tidStr,
      cuenta_id: cxc.id,
      numero_venta: numeroVenta,
      cobro_id: result.cobro_id,
      monto: amt,
      moneda: curr === "USD" ? "USD" : "GS",
      estado: "aplicado",
      metodo_pago: "transferencia",
      referencia: `bancard tid=${tidStr}`,
      applied_at: appliedAtIso,
      raw_request: body,
    });

  return bancardJson(
    tid,
    "success",
    [msg("success", "PaymentProcessed", "El pago fue autorizado")],
    {
      tkt: result.cobro_id,
      aut_cod: result.cobro_id,
      prnt_msg: buildPrintMsg(documento, numeroVenta, amt, curr, appliedAtIso),
    },
    200,
  );
}

function msg(level: BancardMessage["level"], key: string, dsc: string): BancardMessage {
  return { level, key, dsc: [dsc] };
}

function buildPrintMsg(sub: string, inv: string, amt: number, curr: string, when: string): string[] {
  const money = `${curr} ${Math.round(amt).toLocaleString("es-PY")}`;
  return [
    "GREEN LAND SRL",
    "RUC 80140360-0",
    "Pago autorizado",
    `Abonado: ${sub}`,
    `Cuota:   ${inv}`,
    `Monto:   ${money}`,
    `Fecha:   ${when.slice(0, 19).replace("T", " ")}`,
    "Gracias por su pago.",
  ];
}
