import { NextRequest } from "next/server";
import { corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { consultarDeudasPorDocumento } from "@/lib/bancard/consulta";
import { bancardJson, parseTid, type BancardMessage } from "@/lib/bancard/format";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * GET /api/bancard/deudas/consultar?tid=X&sub_id[]=Y[&prd_id=Z]
 *
 * Cumple con la especificación Bancard "Obtener Facturas" (Servicio de Cobranzas).
 *
 * Query params:
 *   tid       (long)      requerido — id de transacción de Bancard
 *   sub_id[]  (string[])  requerido — identificador del abonado (CI o RUC en Green Land)
 *   prd_id    (int)       opcional (v2.0) — Green Land solo vende cuotas de propiedad
 *   addl      (JSON)      opcional — datos adicionales
 *
 * Respuestas (shape según PDF, sección "Obtener Facturas"):
 *   200 QueryProcessed        → { status:"success", tid, messages:[QueryProcessed], invoices:[...] }
 *   200 SubscriberWithoutDebt → { status:"success", tid, messages:[SubscriberWithoutDebt] }
 *   404 SubscriberNotFound    → { status:"success", tid, messages:[SubscriberNotFound] }
 *   403 MissingParameters     → { status:"success", tid, messages:[MissingParameters] }
 *   422 InvalidParameters     → { status:"success", tid, messages:[InvalidParameters] }
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const tidRaw = sp.get("tid");
  const tid = parseTid(tidRaw) ?? 0;

  // sub_id puede venir como sub_id, sub_id[], o sub_id[0]. Soportamos las 3.
  const subIds: string[] = [];
  const single = sp.get("sub_id");
  if (single) subIds.push(single);
  for (const v of sp.getAll("sub_id[]")) subIds.push(v);
  for (const [k, v] of sp.entries()) {
    if (/^sub_id\[\d+\]$/.test(k)) subIds.push(v);
  }

  if (tid === 0 || !tidRaw) {
    return bancardJson(0, "success", [msg("info", "MissingParameters", "Falta el parámetro 'tid'")], undefined, 403);
  }
  if (subIds.length === 0) {
    return bancardJson(tid, "success", [msg("info", "MissingParameters", "Falta el parámetro 'sub_id'")], undefined, 403);
  }
  const documento = subIds[0]!.trim();
  if (documento.length < 4) {
    return bancardJson(tid, "success", [msg("info", "InvalidParameters", "sub_id demasiado corto")], undefined, 422);
  }

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) {
    return bancardJson(tid, "success", [msg("info", "HostTransactionError", "empresa no resuelta")], undefined, 403);
  }

  const data = await consultarDeudasPorDocumento(supabase, empresaId, documento);

  // Cliente no encontrado
  if (!data.cliente) {
    return bancardJson(
      tid,
      "success",
      [msg("info", "SubscriberNotFound", `El abonado con código ${documento} no existe`)],
      undefined,
      404,
    );
  }

  // Solo cuotas con saldo > 0 (Bancard espera únicamente pendientes)
  const pendientes = data.cuotas.filter((c) => c.saldo > 0 && c.estado !== "pagado");

  if (pendientes.length === 0) {
    return bancardJson(
      tid,
      "success",
      [msg("info", "SubscriberWithoutDebt", `El abonado con código ${documento} no tiene deuda pendiente`)],
      undefined,
      403,
    );
  }

  // Mapear al shape "Invoice" de Bancard
  const invoices = pendientes.map((c) => ({
    due: c.fecha_vencimiento ?? "",
    amt: Math.round(c.saldo),
    min_amt: Math.round(c.saldo),
    inv_id: [c.numero ?? c.id],
    curr: normalizarMoneda(c.moneda),
    addl: [
      data.cliente ? `Cliente: ${data.cliente.nombre}` : "",
      documento ? `Documento: ${documento}` : "",
    ].filter(Boolean),
    cm_amt: 0,
    cm_curr: normalizarMoneda(c.moneda),
    dsc: c.numero_cuota && c.total_cuotas
      ? `Cuota ${c.numero_cuota}/${c.total_cuotas}${c.numero ? ` · ${c.numero}` : ""}`
      : c.numero ?? "Cuota",
  }));

  return bancardJson(
    tid,
    "success",
    [msg("success", "QueryProcessed", "Consulta procesada con éxito")],
    { invoices },
    200,
  );
}

function msg(level: BancardMessage["level"], key: string, dsc: string): BancardMessage {
  return { level, key, dsc: [dsc] };
}

function normalizarMoneda(m: string | null | undefined): string {
  const s = (m ?? "").toUpperCase();
  if (s === "USD") return "USD";
  return "PYG"; // GS → PYG (ISO 4217)
}
