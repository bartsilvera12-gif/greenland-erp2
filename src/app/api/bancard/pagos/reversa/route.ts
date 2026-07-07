import { NextRequest } from "next/server";
import { corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { bancardJson, parseTid, type BancardMessage } from "@/lib/bancard/format";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * POST /api/bancard/pagos/reversa
 *
 * Cumple con la spec Bancard "Reversar Transacción".
 *
 * Body JSON:
 *   { "tid": 11332 }
 *
 * Idempotente: si el tid ya está reversado, devuelve success igual.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | null = null;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return bancardJson(0, "error", [msg("error", "InvalidParameters", "JSON inválido")], undefined, 422); }
  if (!body) return bancardJson(0, "error", [msg("error", "InvalidParameters", "Body vacío")], undefined, 422);

  const tid = parseTid(body.tid);
  if (tid === null) {
    return bancardJson(0, "error", [msg("error", "MissingParameters", "tid requerido")], undefined, 403);
  }

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) {
    return bancardJson(tid, "error", [msg("error", "HostTransactionError", "empresa no resuelta")], undefined, 403);
  }

  const partnerId = "bancard";
  const tidStr = String(tid);

  // 1) Buscar el pago externo
  const { data: pagoRaw } = await supabase
    .from("pagos_externos")
    .select("id, cuenta_id, cobro_id, monto, estado, reversed_at")
    .eq("empresa_id", empresaId)
    .eq("partner_id", partnerId)
    .eq("transaccion_id", tidStr)
    .maybeSingle();

  if (!pagoRaw) {
    return bancardJson(tid, "error", [msg("error", "TransactionNotReversed", "tid no encontrado")], undefined, 403);
  }
  const pago = pagoRaw as { id: string; cuenta_id: string; cobro_id: string | null; monto: number; estado: string; reversed_at: string | null };

  // Idempotencia: ya reversado
  if (pago.estado === "reversado") {
    return bancardJson(
      tid,
      "success",
      [msg("success", "TransactionReversed", "Transacción ya reversada previamente")],
      undefined,
      200,
    );
  }

  const reversedAt = new Date().toISOString();

  // 2) Soft-delete del cobro
  if (pago.cobro_id) {
    const upd = await supabase
      .from("cobros_clientes")
      .update({
        estado: "reversado",
        reversed_at: reversedAt,
        reversa_transaccion_id: tidStr,
        reversa_motivo: "reversa técnica Bancard",
      })
      .eq("empresa_id", empresaId)
      .eq("id", pago.cobro_id);
    if (upd.error) {
      return bancardJson(tid, "error", [msg("error", "HostTransactionError", upd.error.message)], undefined, 403);
    }
  }

  // 3) Restaurar saldo
  const { data: cuentaRaw } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, total, saldo")
    .eq("empresa_id", empresaId)
    .eq("id", pago.cuenta_id)
    .maybeSingle();

  if (!cuentaRaw) {
    return bancardJson(tid, "error", [msg("error", "HostTransactionError", "cuenta no encontrada")], undefined, 403);
  }
  const cuenta = cuentaRaw as { id: string; total: number; saldo: number };
  const total = Number(cuenta.total) || 0;
  const saldoActual = Number(cuenta.saldo) || 0;
  const saldoNuevo = Math.min(total, saldoActual + Number(pago.monto));
  const estadoNuevo = saldoNuevo <= 0.001 ? "pagado" : saldoNuevo < total ? "parcial" : "pendiente";

  const updC = await supabase
    .from("cuentas_por_cobrar")
    .update({ saldo: saldoNuevo, estado: estadoNuevo, updated_at: reversedAt })
    .eq("empresa_id", empresaId)
    .eq("id", pago.cuenta_id);
  if (updC.error) {
    return bancardJson(tid, "error", [msg("error", "HostTransactionError", updC.error.message)], undefined, 403);
  }

  // 4) Marcar pago externo como reversado
  await supabase
    .from("pagos_externos")
    .update({ estado: "reversado", reversed_at: reversedAt })
    .eq("id", pago.id);

  return bancardJson(
    tid,
    "success",
    [msg("success", "TransactionReversed", "Transacción reversada satisfactoriamente")],
    undefined,
    200,
  );
}

function msg(level: BancardMessage["level"], key: string, dsc: string): BancardMessage {
  return { level, key, dsc: [dsc] };
}
