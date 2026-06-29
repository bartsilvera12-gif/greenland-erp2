import { NextRequest, NextResponse } from "next/server";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

/**
 * GET /api/ventas/[id]/recibo?auto=1
 * HTML imprimible (A4) del comprobante de venta. Para Green Land — formato
 * limpio con datos de cliente, propiedad (si linkeada), detalle/cuotas y total.
 * Con ?auto=1 dispara window.print() al cargar.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function gs(n: number | string | null | undefined, moneda?: string): string {
  if (n == null) return "—";
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  const sym = (moneda ?? "GS") === "USD" ? "USD" : "Gs.";
  return `${sym} ${Math.round(v).toLocaleString("es-PY")}`;
}
function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = String(iso).slice(0, 10).split("-");
  return t.length === 3 ? `${t[2]}/${t[1]}/${t[0]}` : iso;
}
function fmtLargo(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

export async function GET(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  const { id } = await ctxP.params;
  if (!UUID_RE.test(id)) {
    return new NextResponse("id inválido", { status: 400 });
  }
  const ctx = await getClientesSupabaseFromAuthWithRol(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const { supabase, auth } = ctx;

  // Venta
  const { data: ventaRaw, error: errV } = await supabase
    .from("ventas")
    .select("id, numero_control, tipo_venta, total, moneda, cliente_id, propiedad_id, created_at")
    .eq("empresa_id", auth.empresa_id)
    .eq("id", id)
    .maybeSingle();
  if (errV || !ventaRaw) return new NextResponse("Venta no encontrada", { status: 404 });
  const venta = ventaRaw as { id: string; numero_control: string; tipo_venta: string; total: number | string; moneda: string; cliente_id: string | null; propiedad_id: string | null; created_at: string };

  // Cliente
  let cliente: { nombre: string; ruc: string | null; documento: string | null; telefono: string | null; email: string | null } = { nombre: "Cliente", ruc: null, documento: null, telefono: null, email: null };
  if (venta.cliente_id) {
    const { data: c } = await supabase
      .from("clientes")
      .select("empresa, nombre_contacto, ruc, documento, telefono, email")
      .eq("id", venta.cliente_id)
      .maybeSingle();
    if (c) {
      const row = c as { empresa: string | null; nombre_contacto: string | null; ruc: string | null; documento: string | null; telefono?: string | null; email?: string | null };
      cliente = {
        nombre: (row.empresa ?? row.nombre_contacto ?? "Cliente").trim() || "Cliente",
        ruc: row.ruc, documento: row.documento,
        telefono: row.telefono ?? null, email: row.email ?? null,
      };
    }
  }

  // Propiedad (opcional)
  type Propiedad = {
    titulo: string; codigo: string | null; ciudad: string | null; barrio: string | null;
    finca: string | null; padron: string | null; cuenta_catastral: string | null;
    terreno_m2: number | string | null;
  };
  let propiedad: Propiedad | null = null;
  if (venta.propiedad_id) {
    const { data: p } = await supabase
      .from("propiedades")
      .select("titulo, codigo, ciudad, barrio, finca, padron, cuenta_catastral, terreno_m2")
      .eq("id", venta.propiedad_id)
      .maybeSingle();
    if (p) propiedad = p as Propiedad;
  }

  // Cuotas
  const { data: cxcRaw } = await supabase
    .from("cuentas_por_cobrar")
    .select("numero_venta, fecha_vencimiento, total, saldo, estado, numero_cuota, total_cuotas")
    .eq("empresa_id", auth.empresa_id)
    .eq("venta_id", id)
    .order("numero_cuota", { ascending: true, nullsFirst: false });
  const cuotas = (cxcRaw ?? []) as Array<{ numero_venta: string | null; fecha_vencimiento: string | null; total: number | string; saldo: number | string; estado: string; numero_cuota: number | null; total_cuotas: number | null }>;

  // Nombre del negocio
  const negocio = (process.env.NEURA_CLIENT_NAME ?? "Green Land").trim() || "Green Land";

  const autoPrint = new URL(request.url).searchParams.get("auto") === "1";
  const totalNum = Number(venta.total) || 0;
  const moneda = venta.moneda || "GS";

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Recibo ${esc(venta.numero_control)}</title>
<style>
  @page { size: A4; margin: 18mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system,'Segoe UI',Roboto,sans-serif; color: #0d2418; margin: 0; font-size: 12.5px; line-height: 1.5; }
  .container { max-width: 800px; margin: 0 auto; padding: 12px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #1aa056; margin-bottom: 22px; }
  header .brand { display:flex; align-items:center; gap:14px; }
  header .brand svg { width: 46px; height: 50px; }
  header .name { font-family: 'Bricolage Grotesque',sans-serif; font-weight: 800; font-size: 22px; color: #0d5e37; letter-spacing: -.02em; }
  header .tagline { font-size: 11px; color: #7c8a82; margin-top: 2px; }
  header .doc-meta { text-align: right; }
  header .doc-meta .tag { display: inline-block; padding: 3px 10px; border-radius: 100px; background: #e7f6ee; color: #0d5e37; font-weight:700; font-size:10.5px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
  header .doc-meta .num { font-family: 'Bricolage Grotesque',sans-serif; font-weight: 800; font-size: 18px; }
  header .doc-meta .date { font-size: 11.5px; color: #7c8a82; margin-top: 2px; }
  h2 { font-family: 'Bricolage Grotesque',sans-serif; font-weight: 700; font-size: 13px; margin: 26px 0 12px; padding-top: 14px; padding-bottom: 6px; border-top: 2px solid #1aa056; border-bottom: 1px solid #e6ede8; letter-spacing: .03em; text-transform: uppercase; color: #0d5e37; }
  h2:first-of-type { margin-top: 8px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; }
  .field { font-size: 12px; }
  .field .lbl { font-size: 10px; color: #7c8a82; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
  .field .val { font-size: 12.5px; font-weight: 500; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 9px 10px; text-align: left; font-size: 12px; border-bottom: 1px solid #eef3ef; }
  th { background: #f6faf7; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #5a6b60; font-weight: 700; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total-box { margin-top: 18px; background: linear-gradient(120deg,#1aa056,#0d5e37); color: #fff; border-radius: 12px; padding: 16px 22px; display: flex; justify-content: space-between; align-items: center; }
  .total-box .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; opacity: .85; }
  .total-box .val { font-family: 'Bricolage Grotesque',sans-serif; font-weight: 800; font-size: 28px; letter-spacing: -.02em; }
  .firmas { margin-top: 44px; display: grid; grid-template-columns: 1fr 1fr; gap: 56px; }
  .firma { text-align: center; }
  .firma .line { border-top: 1px solid #0d2418; padding-top: 6px; font-size: 11px; color: #5a6b60; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eef3ef; font-size: 10.5px; color: #7c8a82; text-align: center; }
  @media print { .no-print { display:none } body { padding:0 } }
  .actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 10; }
  .actions button { padding: 9px 16px; border-radius: 9px; border: none; font-weight: 700; cursor: pointer; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,.12); }
  .actions .print { background: #1aa056; color: #fff; }
  .actions .close { background: #fff; color: #0d2418; border: 1px solid #e6ede8; }
</style>
</head>
<body>
<div class="actions no-print">
  <button class="close" onclick="window.close()">Cerrar</button>
  <button class="print" onclick="window.print()">Imprimir</button>
</div>
<div class="container">
  <header>
    <div class="brand">
      <svg viewBox="0 0 40 44" fill="none">
        <path d="M20 43C20 43 6 33 6 19C6 9 13 2 20 2" stroke="#8cc63f" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M20 43C20 43 9 30 12 17C14.5 7 22 3 31 4C32 13 30 24 24 31C20.5 35 20 38 20 43Z" fill="#8cc63f"/>
        <path d="M20 43C20 43 22 28 28 20C31.5 15 35 13 38 13C37 22 34 31 27 36C23 39 21 39 20 43Z" fill="#2fbf99"/>
      </svg>
      <div>
        <div class="name">${esc(negocio)}</div>
        <div class="tagline">Comprobante de venta</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="tag">${esc(venta.tipo_venta)}</div>
      <div class="num">${esc(venta.numero_control)}</div>
      <div class="date">${esc(fmtLargo(venta.created_at))}</div>
    </div>
  </header>

  <h2>Datos del cliente</h2>
  <div class="grid-2">
    <div class="field"><div class="lbl">Razón social / Nombre</div><div class="val">${esc(cliente.nombre)}</div></div>
    <div class="field"><div class="lbl">RUC / Documento</div><div class="val">${esc(cliente.ruc || cliente.documento || "—")}</div></div>
    ${cliente.telefono ? `<div class="field"><div class="lbl">Teléfono</div><div class="val">${esc(cliente.telefono)}</div></div>` : ""}
    ${cliente.email ? `<div class="field"><div class="lbl">Email</div><div class="val">${esc(cliente.email)}</div></div>` : ""}
  </div>

  ${propiedad ? `
    <h2>Propiedad</h2>
    <div class="grid-2">
      <div class="field"><div class="lbl">Título</div><div class="val">${esc(propiedad.titulo)}</div></div>
      ${propiedad.codigo ? `<div class="field"><div class="lbl">Código</div><div class="val">${esc(propiedad.codigo)}</div></div>` : ""}
      ${propiedad.ciudad ? `<div class="field"><div class="lbl">Ciudad / Barrio</div><div class="val">${esc([propiedad.ciudad, propiedad.barrio].filter(Boolean).join(" · "))}</div></div>` : ""}
      ${propiedad.terreno_m2 ? `<div class="field"><div class="lbl">Superficie</div><div class="val">${esc(propiedad.terreno_m2)} m²</div></div>` : ""}
      ${propiedad.finca ? `<div class="field"><div class="lbl">Finca</div><div class="val">${esc(propiedad.finca)}</div></div>` : ""}
      ${propiedad.padron ? `<div class="field"><div class="lbl">Padrón</div><div class="val">${esc(propiedad.padron)}</div></div>` : ""}
      ${propiedad.cuenta_catastral ? `<div class="field"><div class="lbl">Cuenta catastral</div><div class="val">${esc(propiedad.cuenta_catastral)}</div></div>` : ""}
    </div>
  ` : ""}

  ${cuotas.length > 1 ? `
    <h2>Plan de cuotas (${cuotas.length})</h2>
    <table>
      <thead><tr><th style="width:80px">Cuota</th><th>Número</th><th>Vencimiento</th><th class="num">Monto</th><th>Estado</th></tr></thead>
      <tbody>
        ${cuotas.map((c) => `<tr>
          <td>${esc(c.numero_cuota ?? "—")} / ${esc(c.total_cuotas ?? "—")}</td>
          <td>${esc(c.numero_venta || "—")}</td>
          <td>${esc(fmt(c.fecha_vencimiento))}</td>
          <td class="num">${esc(gs(c.total, moneda))}</td>
          <td>${esc(c.estado)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  ` : `
    <h2>Detalle</h2>
    <table>
      <thead><tr><th>Concepto</th><th>Vencimiento</th><th class="num">Monto</th></tr></thead>
      <tbody>
        ${(cuotas[0] ? [`<tr>
          <td>${esc(propiedad ? propiedad.titulo : "Venta " + venta.numero_control)}</td>
          <td>${esc(fmt(cuotas[0].fecha_vencimiento))}</td>
          <td class="num">${esc(gs(cuotas[0].total, moneda))}</td>
        </tr>`] : [`<tr>
          <td>${esc(propiedad ? propiedad.titulo : "Venta " + venta.numero_control)}</td>
          <td>—</td>
          <td class="num">${esc(gs(totalNum, moneda))}</td>
        </tr>`]).join("")}
      </tbody>
    </table>
  `}

  <div class="total-box">
    <div class="lbl">Total</div>
    <div class="val">${esc(gs(totalNum, moneda))}</div>
  </div>

  <div class="firmas">
    <div class="firma"><div class="line">Firma del cliente</div></div>
    <div class="firma"><div class="line">Firma autorizada · ${esc(negocio)}</div></div>
  </div>

  <div class="footer">
    Este comprobante no es válido como factura fiscal. Consultá tus pagos en greenlandpy.com / Mis Pagos.
  </div>
</div>
${autoPrint ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>` : ""}
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
