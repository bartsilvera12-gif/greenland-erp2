/**
 * Importa el HISTÓRICO de ventas a crédito (cuotas, refuerzos anuales y
 * cancelación final) + los pagos ya cobrados, desde un Excel, al schema de
 * Green Land. Deja el "Estado de cuenta" de cada cliente completo.
 *
 * NO toca stock, compras, producción ni SIFEN: solo crea ventas a crédito,
 * cuentas por cobrar (cuotas / refuerzos / cancelación) y cobros de clientes.
 *
 * Uso:
 *   npx tsx scripts/importar-historico-cobros.ts --plantilla historico.xlsx
 *   npx tsx scripts/importar-historico-cobros.ts historico.xlsx            # PRUEBA
 *   npx tsx scripts/importar-historico-cobros.ts historico.xlsx --apply    # aplica
 *
 * Variables (.env.local): SUPABASE_DB_URL (o DIRECT_URL / DATABASE_URL),
 *   NEURA_CLIENT_SCHEMA (opcional). Opciones: --empresa, --empresa-id, --schema.
 *
 * -------------------------------------------------------------------------
 * EXCEL — Hoja "Ventas" (una fila por venta):
 *   ID Venta | RUC/CI | Razón social | Fecha venta | Descripción | Moneda |
 *   Total | Cantidad cuotas | Monto por cuota | Primera cuota vence | Cada (días) |
 *   Cantidad Refuerzo | Monto Refuerzo | Fecha Refuerzo |
 *   Cancelacion | Monto Cancelacion | Fecha Cancelacion
 *
 * EXCEL — Hoja "Pagos" (resumen de lo cobrado por venta):
 *   ID Venta | ... | N° cuota | total cuotas | Fecha pago | Monto | Método | Referencia
 *   - Una fila "normal" = pagado HASTA la cuota N° (se marcan 1..N pagadas).
 *   - Referencia "refuerzo..." con fecha = ese(os) refuerzo(s) pagado(s).
 *   - Referencia "cancelaci..." con fecha = cancelación pagada.
 *   - Método "cancelado" / "contado" (sin N° cuota) = venta saldada por completo.
 *   - Filas sin fecha o separadores (ej. "MANZANA A") se ignoran.
 * -------------------------------------------------------------------------
 */
import { config } from "dotenv";
import * as XLSX from "xlsx";
import path from "node:path";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env.local") });

const MAX_CUOTAS = 240;
const REFUERZO_INTERVALO_DIAS = 365; // refuerzos anuales (mismo mes cada año)

// Correcciones confirmadas por el cliente (total mal tipeado en la planilla).
const CORRECCIONES_TOTAL: Record<string, number> = {
  V015: 243497090, // 130 cuotas x 1.000.000 + 10 refuerzos x 11.349.709
};
// Ventas que son refinanciación / caso especial: se omiten del auto-import y se
// reportan para cargarlas a mano (el detalle de columnas no cierra con el total).
const REFINANCIACION = new Set<string>(["V012"]);

// ---------- CLI ----------
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const plantillaIdx = argv.indexOf("--plantilla");
const plantillaPath = plantillaIdx >= 0 ? argv[plantillaIdx + 1] : null;
const empresaNombre = getOpt("--empresa") ?? "Green";
const empresaIdForzado = getOpt("--empresa-id");
const schemaForzado = getOpt("--schema");
const flagsConValor = new Set(["--empresa", "--empresa-id", "--schema", "--plantilla"]);
const file = argv.find((a, i) => !a.startsWith("--") && !flagsConValor.has(argv[i - 1]));

function getOpt(flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

if (plantillaPath) { generarPlantilla(plantillaPath); process.exit(0); }
if (!file) {
  console.error("Uso: npx tsx scripts/importar-historico-cobros.ts <archivo.xlsx> [--apply]");
  console.error("     npx tsx scripts/importar-historico-cobros.ts --plantilla historico.xlsx");
  process.exit(1);
}
const dbUrl =
  process.env.SUPABASE_DB_URL?.trim() || process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() || null;

// ---------- Tipos ----------
type Row = Record<string, unknown>;
type TipoCuota = "cuota" | "refuerzo" | "cancelacion";

interface VentaImport {
  fila: number; idVenta: string; ruc: string | null; documento: string | null;
  razonSocial: string; fechaVenta: string; descripcion: string | null;
  moneda: "GS" | "USD"; total: number;
  cuotas: number; montoCuota: number | null; primeraCuota: string | null; intervalo: number;
  refCantidad: number; refMonto: number; refFecha: string | null;
  cancCantidad: number; cancMonto: number; cancFecha: string | null;
}
interface PagoVenta {
  idVenta: string;
  cuotasPagadas: number;      // nº de cuotas normales pagadas (1..N)
  refuerzosPagados: number;   // nº de refuerzos pagados
  cancelacionPagada: boolean;
  saldada: boolean;           // método "cancelado"/"contado" => todo pagado
  fechaUltimoPago: string | null;
  notas: string[];            // para el reporte de asunciones
}

// ---------- Utilidades ----------
function quoteIdent(s: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error(`schema inválido: ${s}`);
  return `"${s}"`;
}
function str(v: unknown): string { return v === null || v === undefined ? "" : String(v).trim(); }
function esVacio(v: unknown): boolean { const s = str(v); return s === "" || s === "-"; }
function num(v: unknown): number {
  if (typeof v === "number") return v;
  // tolera "66.911.663." (miles con punto) y "1.000.000"
  const s = String(v ?? "").trim().replace(/\.$/, "");
  const n = Number(s.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
function toISODate(v: unknown): string | null {
  if (v == null || v === "" || v === "-") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) { const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0"); let y = m[3]; if (y.length === 2) y = `20${y}`; return `${y}-${mo}-${d}`; }
  return null;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
/** Suma años conservando el mes/día (para refuerzos anuales). */
function addYearsISO(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function cell(row: Row, ...names: string[]): unknown {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(norm(k), row[k]);
  for (const n of names) { const hit = map.get(norm(n)); if (hit !== undefined) return hit; }
  return undefined;
}

// ---------- Plantilla ----------
function generarPlantilla(destino: string) {
  const ventas = [{
    "ID Venta": "V001", "RUC/CI": "1234567", "Razón social": "Juan Pérez",
    "Fecha venta": "15/01/2026", "Descripción": "Lote 4 - Manzana A", "Moneda": "GS",
    "Total": 231021496, "Cantidad cuotas": 130, "Monto por cuota": 1000000,
    "Primera cuota vence": "05/11/2025", "Cada (días)": 30,
    "Cantidad Refuerzo": 10, "Monto Refuerzo": 5000000, "Fecha Refuerzo": "05/10/2026",
    "Cancelacion": 1, "Monto Cancelacion": 51021496, "Fecha Cancelacion": "20/09/2036",
  }];
  const pagos = [
    { "ID Venta": "V001", "Razón social": "Juan Pérez", "N° cuota": 13, "total cuotas": 130, "Fecha pago": "05/10/2026", "Monto": 1000000, "Método": "transferencia", "Referencia": "" },
    { "ID Venta": "V001", "Razón social": "Juan Pérez", "N° cuota": 1, "total cuotas": 10, "Fecha pago": "", "Monto": 5000000, "Método": "", "Referencia": "refuerzo anual cada octubre" },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas), "Ventas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagos), "Pagos");
  XLSX.writeFile(wb, path.resolve(destino));
  console.log(`✅ Plantilla creada en: ${path.resolve(destino)}`);
}

// ---------- Parseo ----------
function parseExcel(ruta: string): { ventas: VentaImport[]; pagos: Map<string, PagoVenta>; errores: string[]; avisos: string[] } {
  const wb = XLSX.readFile(path.resolve(ruta), { cellDates: true });
  const errores: string[] = [], avisos: string[] = [];

  const wsV = wb.Sheets["Ventas"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!wsV) throw new Error('No se encontró la hoja "Ventas".');
  const rowsV = XLSX.utils.sheet_to_json<Row>(wsV, { defval: null });
  const ventas: VentaImport[] = [];
  const ids = new Set<string>();

  rowsV.forEach((r, i) => {
    const fila = i + 2;
    const idVenta = str(cell(r, "ID Venta", "ID"));
    const razon = str(cell(r, "Razón social", "Cliente", "Nombre"));
    if (!idVenta && !razon) return;
    if (!idVenta) { errores.push(`Ventas fila ${fila}: falta "ID Venta".`); return; }
    if (ids.has(idVenta)) { errores.push(`Ventas fila ${fila}: "ID Venta" duplicado (${idVenta}).`); return; }
    ids.add(idVenta);
    if (!razon) { errores.push(`Ventas fila ${fila}: falta "Razón social".`); return; }
    const fechaVenta = toISODate(cell(r, "Fecha venta", "Fecha"));
    if (!fechaVenta) { errores.push(`Ventas fila ${fila}: "Fecha venta" inválida.`); return; }

    let total = num(cell(r, "Total", "Monto total"));
    if (CORRECCIONES_TOTAL[idVenta] !== undefined) {
      avisos.push(`${idVenta}: total corregido ${Number.isFinite(total) ? total.toLocaleString("es-PY") : "?"} → ${CORRECCIONES_TOTAL[idVenta].toLocaleString("es-PY")} (confirmado por el cliente).`);
      total = CORRECCIONES_TOTAL[idVenta];
    }
    if (!Number.isFinite(total) || total <= 0) { errores.push(`Ventas fila ${fila} (${idVenta}): "Total" inválido.`); return; }

    let cuotas = Math.trunc(num(cell(r, "Cantidad cuotas", "Cuotas")));
    if (!Number.isFinite(cuotas) || cuotas < 1) cuotas = 1;
    if (cuotas > MAX_CUOTAS) { errores.push(`Ventas fila ${fila} (${idVenta}): cuotas ${cuotas} supera ${MAX_CUOTAS}.`); return; }
    const mc = num(cell(r, "Monto por cuota", "Monto cuota"));
    const montoCuota = Number.isFinite(mc) && mc > 0 ? Math.round(mc) : null;
    const intRaw = Math.trunc(num(cell(r, "Cada (días)", "Intervalo", "Frecuencia")));
    const intervalo = Number.isFinite(intRaw) && intRaw > 0 ? intRaw : 30;
    const moneda: "GS" | "USD" = str(cell(r, "Moneda")).toUpperCase() === "USD" ? "USD" : "GS";

    // Refuerzos / cancelación (celdas "-" o vacías => 0).
    const refCantidad = esVacio(cell(r, "Cantidad Refuerzo")) ? 0 : Math.max(0, Math.trunc(num(cell(r, "Cantidad Refuerzo"))));
    const refMonto = esVacio(cell(r, "Monto Refuerzo")) ? 0 : Math.round(num(cell(r, "Monto Refuerzo")) || 0);
    const refFecha = toISODate(cell(r, "Fecha Refuerzo"));
    const cancCantidad = esVacio(cell(r, "Cancelacion", "Cancelación")) ? 0 : Math.max(0, Math.trunc(num(cell(r, "Cancelacion", "Cancelación"))));
    const cancMonto = esVacio(cell(r, "Monto Cancelacion", "Monto Cancelación")) ? 0 : Math.round(num(cell(r, "Monto Cancelacion", "Monto Cancelación")) || 0);
    const cancFecha = toISODate(cell(r, "Fecha Cancelacion", "Fecha Cancelación"));

    const rucDoc = str(cell(r, "RUC/CI", "RUC")) || null;
    ventas.push({
      fila, idVenta, ruc: rucDoc, documento: str(cell(r, "CI", "Documento")) || rucDoc,
      razonSocial: razon, fechaVenta, descripcion: str(cell(r, "Descripción", "Detalle")) || null,
      moneda, total, cuotas, montoCuota, primeraCuota: toISODate(cell(r, "Primera cuota vence", "Primera cuota")), intervalo,
      refCantidad, refMonto, refFecha, cancCantidad, cancMonto, cancFecha,
    });
  });

  // ----- Pagos: resumir por venta -----
  const pagos = new Map<string, PagoVenta>();
  const wsP = wb.Sheets["Pagos"];
  if (wsP) {
    const rowsP = XLSX.utils.sheet_to_json<Row>(wsP, { defval: null });
    for (const r of rowsP) {
      const idVenta = str(cell(r, "ID Venta", "ID"));
      if (!idVenta || !ids.has(idVenta)) continue; // separador (MANZANA A) o id inexistente
      const ref = str(cell(r, "Referencia")).toLowerCase();
      const metodo = str(cell(r, "Método", "Metodo")).toLowerCase();
      const fecha = toISODate(cell(r, "Fecha pago", "Fecha"));
      const nCuota = Math.trunc(num(cell(r, "N° cuota", "Nro cuota", "Cuota"))) || 0;

      const pv = pagos.get(idVenta) ?? { idVenta, cuotasPagadas: 0, refuerzosPagados: 0, cancelacionPagada: false, saldada: false, fechaUltimoPago: null, notas: [] };

      if (metodo === "cancelado" || metodo === "contado") {
        pv.saldada = true;
        pv.notas.push(`marcada como "${metodo}" → se asume saldada por completo (confirmar).`);
      } else if (ref.includes("refuerzo")) {
        if (fecha) { pv.refuerzosPagados = Math.max(pv.refuerzosPagados, nCuota || 1); pv.fechaUltimoPago = maxFecha(pv.fechaUltimoPago, fecha); }
      } else if (ref.includes("cancelaci")) {
        if (fecha) { pv.cancelacionPagada = true; pv.fechaUltimoPago = maxFecha(pv.fechaUltimoPago, fecha); }
      } else if (fecha && nCuota > 0) {
        pv.cuotasPagadas = Math.max(pv.cuotasPagadas, nCuota);
        pv.fechaUltimoPago = maxFecha(pv.fechaUltimoPago, fecha);
      } else if (ref || str(cell(r, "Monto")) ) {
        // fila con monto/nota pero sin fecha clara => a revisar
        pv.notas.push(`fila sin fecha/cuota clara (ref: "${str(cell(r, "Referencia"))}", método: "${str(cell(r, "Método"))}") → no se aplicó pago.`);
      }
      pagos.set(idVenta, pv);
    }
  }

  return { ventas, pagos, errores, avisos };
}

function maxFecha(a: string | null, b: string | null): string | null {
  if (!a) return b; if (!b) return a; return a >= b ? a : b;
}

// ---------- Generación del cronograma ----------
interface Obligacion { tipo: TipoCuota; numero: number; totalDeTipo: number; monto: number; vencimiento: string; }

function generarCronograma(v: VentaImport): { obligaciones: Obligacion[]; sumaCalculada: number; cuadra: boolean } {
  const obligaciones: Obligacion[] = [];
  // 1) Cuotas normales (ajustando la última por redondeo SOLO si no hay refuerzos/cancelación).
  const n = Math.max(1, Math.min(MAX_CUOTAS, v.cuotas));
  const base = v.montoCuota && v.montoCuota > 0 ? v.montoCuota : Math.round(v.total / n);
  const hayExtras = v.refCantidad > 0 || v.cancCantidad > 0;
  const objetivoCuotas = hayExtras ? base * n : v.total; // si no hay extras, las cuotas deben sumar el total
  let fc = v.primeraCuota ?? addDaysISO(v.fechaVenta, v.intervalo);
  let acum = 0;
  for (let i = 1; i <= n; i++) {
    const monto = i < n ? base : Math.round(objetivoCuotas - acum);
    acum += monto;
    obligaciones.push({ tipo: "cuota", numero: i, totalDeTipo: n, monto, vencimiento: fc });
    fc = addDaysISO(fc, v.intervalo);
  }
  // 2) Refuerzos anuales.
  if (v.refCantidad > 0 && v.refMonto > 0) {
    let rf = v.refFecha ?? addYearsISO(v.primeraCuota ?? v.fechaVenta, 1);
    for (let i = 1; i <= v.refCantidad; i++) {
      obligaciones.push({ tipo: "refuerzo", numero: i, totalDeTipo: v.refCantidad, monto: v.refMonto, vencimiento: rf });
      rf = addYearsISO(rf, 1);
    }
  }
  // 3) Cancelación final.
  if (v.cancCantidad > 0 && v.cancMonto > 0) {
    const cf = v.cancFecha ?? addYearsISO(v.fechaVenta, 11);
    for (let i = 1; i <= v.cancCantidad; i++) {
      obligaciones.push({ tipo: "cancelacion", numero: i, totalDeTipo: v.cancCantidad, monto: v.cancMonto, vencimiento: cf });
    }
  }
  const sumaCalculada = obligaciones.reduce((a, o) => a + o.monto, 0);
  const cuadra = Math.abs(sumaCalculada - v.total) <= n; // tolerancia de redondeo
  return { obligaciones, sumaCalculada, cuadra };
}

// ---------- Main ----------
async function main() {
  const { ventas, pagos, errores, avisos } = parseExcel(file!);
  console.log(`\n=== Importación de histórico (${apply ? "APLICAR" : "PRUEBA — no escribe"}) ===`);
  console.log(`Archivo: ${path.resolve(file!)}`);
  console.log(`Ventas: ${ventas.length}`);

  for (const a of avisos) console.log(`  · aviso: ${a}`);
  if (errores.length) {
    console.error(`\n❌ ${errores.length} error(es):`);
    for (const e of errores) console.error(`   • ${e}`);
    process.exit(1);
  }
  if (!ventas.length) { console.error("No hay ventas."); process.exit(1); }

  // Análisis + reporte (sin base de datos).
  const aCargar: VentaImport[] = [];
  const revisar: string[] = [];
  let totCuotas = 0, totRef = 0, totCanc = 0;
  console.log(`\n--- Plan por venta ---`);
  for (const v of ventas) {
    if (REFINANCIACION.has(v.idVenta)) { revisar.push(`${v.idVenta} (${v.razonSocial}): REFINANCIACIÓN — se omite del import automático, cargar a mano.`); continue; }
    const { obligaciones, sumaCalculada, cuadra } = generarCronograma(v);
    if (!cuadra) {
      revisar.push(`${v.idVenta} (${v.razonSocial}): suma ${sumaCalculada.toLocaleString("es-PY")} ≠ total ${v.total.toLocaleString("es-PY")} — NO se carga hasta corregir.`);
      continue;
    }
    aCargar.push(v);
    const nc = obligaciones.filter(o => o.tipo === "cuota").length;
    const nr = obligaciones.filter(o => o.tipo === "refuerzo").length;
    const ncc = obligaciones.filter(o => o.tipo === "cancelacion").length;
    totCuotas += nc; totRef += nr; totCanc += ncc;
    const p = pagos.get(v.idVenta);
    let pagoTxt = "sin pagos";
    if (p) {
      const parts: string[] = [];
      if (p.saldada) parts.push("SALDADA (todo pagado)");
      if (p.cuotasPagadas) parts.push(`${p.cuotasPagadas} cuota(s) pagada(s)`);
      if (p.refuerzosPagados) parts.push(`${p.refuerzosPagados} refuerzo(s)`);
      if (p.cancelacionPagada) parts.push("cancelación pagada");
      pagoTxt = parts.length ? parts.join(", ") + (p.fechaUltimoPago ? ` (últ. ${p.fechaUltimoPago})` : "") : "sin pagos";
      for (const nota of p.notas) revisar.push(`${v.idVenta}: ${nota}`);
    }
    console.log(`  ${v.idVenta.padEnd(5)} ${v.razonSocial.slice(0, 24).padEnd(24)} | ${nc} cuotas${nr ? ` + ${nr} refuerzos` : ""}${ncc ? " + cancelación" : ""} | ${pagoTxt}`);
  }

  console.log(`\nResumen: ${aCargar.length}/${ventas.length} ventas listas | ${totCuotas} cuotas + ${totRef} refuerzos + ${totCanc} cancelaciones`);
  if (revisar.length) {
    console.log(`\n⚠️  A REVISAR / CONFIRMAR CON EL CLIENTE (${revisar.length}):`);
    for (const r of revisar) console.log(`   • ${r}`);
  }

  if (!dbUrl) {
    console.log(`\nℹ️  Sin conexión a la base (falta SUPABASE_DB_URL). Validación offline OK.\n`);
    return;
  }
  if (!apply) {
    console.log(`\n✅ PRUEBA OK. Nada se escribió. Para aplicar: --apply\n`);
    // igual resolvemos empresa para confirmar conexión
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    let empresaId = empresaIdForzado;
    let schema = schemaForzado ?? process.env.NEURA_CLIENT_SCHEMA?.trim() ?? null;
    if (!empresaId || !schema) {
      const q = await client.query<{ id: string; nombre_empresa: string | null; data_schema: string | null }>(
        `SELECT id, nombre_empresa, data_schema FROM zentra_erp.empresas WHERE lower(coalesce(nombre_empresa,'')) LIKE lower($1) ORDER BY created_at LIMIT 5`,
        [`%${empresaNombre}%`]);
      if (!q.rows.length) throw new Error(`No se encontró empresa "${empresaNombre}".`);
      if (q.rows.length > 1) { for (const r of q.rows) console.error(`   • ${r.id} | ${r.nombre_empresa} | ${r.data_schema}`); throw new Error("Varias empresas; usá --empresa-id."); }
      empresaId = empresaId ?? q.rows[0].id; schema = schema ?? q.rows[0].data_schema;
      console.log(`Empresa: ${q.rows[0].nombre_empresa} (${empresaId}) · schema: ${schema}`);
    }
    if (!schema) throw new Error("No se pudo resolver el schema.");
    const S = quoteIdent(schema);
    if (!apply) { console.log(`\n✅ PRUEBA OK (empresa/schema resueltos). Nada se escribió. Para aplicar: --apply\n`); return; }

    await client.query("BEGIN");
    let clientesCreados = 0, ventasCreadas = 0, oblCreadas = 0, cobrosCreados = 0;
    for (const v of aCargar) {
      const numeroControl = `HIST-${v.idVenta}`;
      const ya = await client.query(`SELECT 1 FROM ${S}.ventas WHERE empresa_id=$1 AND numero_control=$2 LIMIT 1`, [empresaId, numeroControl]);
      if (ya.rows.length) throw new Error(`La venta ${v.idVenta} (${numeroControl}) ya existe. Abortando para no duplicar.`);

      let clienteId: string | null = null;
      if (v.ruc || v.documento) {
        const m = await client.query(`SELECT id FROM ${S}.clientes WHERE empresa_id=$1 AND (($2::text<>'' AND ruc=$2) OR ($3::text<>'' AND documento=$3)) LIMIT 1`, [empresaId, v.ruc ?? "", v.documento ?? ""]);
        if (m.rows.length) clienteId = m.rows[0].id;
      }
      if (!clienteId) {
        const ins = await client.query(`INSERT INTO ${S}.clientes (empresa_id, empresa, nombre_contacto, ruc, documento, condicion_pago) VALUES ($1,$2,$2,$3,$4,'CREDITO') RETURNING id`, [empresaId, v.razonSocial, v.ruc, v.documento]);
        clienteId = ins.rows[0].id; clientesCreados++;
      }
      const insV = await client.query(
        `INSERT INTO ${S}.ventas (empresa_id, cliente_id, numero_control, moneda, subtotal, monto_iva, total, estado, tipo_venta, fecha, created_at) VALUES ($1,$2,$3,$4,$5,0,$5,'completada','CREDITO',$6,$6) RETURNING id`,
        [empresaId, clienteId, numeroControl, v.moneda === "USD" ? "USD" : "GS", v.total, `${v.fechaVenta}T12:00:00Z`]);
      const ventaId = insV.rows[0].id; ventasCreadas++;

      const { obligaciones } = generarCronograma(v);
      const p = pagos.get(v.idVenta);
      const monedaCxc = v.moneda === "USD" ? "USD" : "PYG";
      for (const o of obligaciones) {
        // ¿pagada?
        let pagada = false;
        if (p?.saldada) pagada = true;
        else if (o.tipo === "cuota" && p && o.numero <= p.cuotasPagadas) pagada = true;
        else if (o.tipo === "refuerzo" && p && o.numero <= p.refuerzosPagados) pagada = true;
        else if (o.tipo === "cancelacion" && p?.cancelacionPagada) pagada = true;
        const saldo = pagada ? 0 : o.monto;
        const estado = pagada ? "pagado" : "pendiente";
        const etiqueta = o.tipo === "cuota" ? `${numeroControl}-C${o.numero}` : o.tipo === "refuerzo" ? `${numeroControl}-R${o.numero}` : `${numeroControl}-CANC`;
        const insC = await client.query(
          `INSERT INTO ${S}.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas, tipo, observaciones) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
          [empresaId, clienteId, ventaId, etiqueta, v.fechaVenta, o.vencimiento, monedaCxc, o.monto, saldo, estado, o.numero, o.totalDeTipo, o.tipo, v.descripcion]);
        oblCreadas++;
        if (pagada) {
          const fp = p?.fechaUltimoPago ?? o.vencimiento;
          await client.query(`INSERT INTO ${S}.cobros_clientes (empresa_id, cliente_id, cuenta_por_cobrar_id, venta_id, fecha_pago, monto, metodo_pago, referencia) VALUES ($1,$2,$3,$4,$5,$6,'transferencia',$7)`,
            [empresaId, clienteId, insC.rows[0].id, ventaId, `${fp}T12:00:00Z`, o.monto, "carga histórica"]);
          cobrosCreados++;
        }
      }
    }
    await client.query("COMMIT");
    console.log(`\n✅ IMPORTACIÓN COMPLETA`);
    console.log(`   Clientes creados: ${clientesCreados} · Ventas: ${ventasCreadas} · Obligaciones: ${oblCreadas} · Cobros: ${cobrosCreados}`);
    if (revisar.length) console.log(`   (${revisar.length} venta(s) quedaron a revisar — ver arriba.)`);
    console.log("");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    console.error(`\n❌ Error — se revirtió TODO: ${e instanceof Error ? e.message : e}\n`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
