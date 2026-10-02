/**
 * Importa el HISTÓRICO de ventas a crédito, sus cuotas y los pagos ya recibidos
 * desde un Excel, al schema de Green Land. Deja el "Estado de cuenta" de cada
 * cliente completo (ventas + cuotas + cobros).
 *
 * NO toca stock, compras, producción ni SIFEN: solo crea ventas a crédito,
 * cuentas por cobrar (cuotas) y cobros de clientes.
 *
 * Uso:
 *   # 1) Generar la plantilla vacía para llenar:
 *   npx tsx scripts/importar-historico-cobros.ts --plantilla historico.xlsx
 *
 *   # 2) Modo PRUEBA (no escribe nada, solo valida y reporta):
 *   npx tsx scripts/importar-historico-cobros.ts historico.xlsx
 *
 *   # 3) Aplicar de verdad (todo dentro de una transacción):
 *   npx tsx scripts/importar-historico-cobros.ts historico.xlsx --apply
 *
 * Variables (en .env.local):
 *   SUPABASE_DB_URL  (o DIRECT_URL / DATABASE_URL)
 *   NEURA_CLIENT_SCHEMA  (opcional; si no, se resuelve por el nombre de la empresa)
 *
 * Opciones:
 *   --empresa "Green Land"   nombre a buscar en zentra_erp.empresas (default: Green)
 *   --empresa-id <uuid>      fuerza el empresa_id (saltea la búsqueda por nombre)
 *   --schema <nombre>        fuerza el schema (saltea data_schema de la empresa)
 *
 * ---------------------------------------------------------------------------
 * ESTRUCTURA DEL EXCEL (dos hojas):
 *
 * Hoja "Ventas" — una fila por venta a crédito:
 *   ID Venta | RUC/CI | Razón social | Fecha venta | Descripción | Moneda |
 *   Total | Cantidad cuotas | Monto por cuota | Primera cuota vence | Cada (días)
 *
 * Hoja "Pagos" — una fila por pago ya recibido (opcional):
 *   ID Venta | N° cuota | Fecha pago | Monto | Método | Referencia
 *
 * - "ID Venta" es un código que inventás vos (ej: V001) y sirve para enlazar los
 *   pagos con su venta. Debe ser único por venta.
 * - Fechas en formato dd/mm/aaaa (o celdas con formato de fecha de Excel).
 * - "Monto por cuota" vacío => se reparte el total en partes iguales.
 * - "Cada (días)" vacío => 30 (mensual). Ej: 15 quincenal, 60 bimestral.
 * ---------------------------------------------------------------------------
 */
import { config } from "dotenv";
import * as XLSX from "xlsx";
import path from "node:path";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env.local") });

const MAX_CUOTAS = 240;

// ---------- CLI ----------
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const plantillaIdx = argv.indexOf("--plantilla");
const plantillaPath = plantillaIdx >= 0 ? argv[plantillaIdx + 1] : null;
const empresaNombre = getOpt("--empresa") ?? "Green";
const empresaIdForzado = getOpt("--empresa-id");
const schemaForzado = getOpt("--schema");
const file = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--empresa" && argv[i - 1] !== "--empresa-id" && argv[i - 1] !== "--schema" && argv[i - 1] !== "--plantilla");

function getOpt(flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

// ---------- Plantilla ----------
if (plantillaPath) {
  generarPlantilla(plantillaPath);
  process.exit(0);
}

if (!file) {
  console.error("Uso: npx tsx scripts/importar-historico-cobros.ts <archivo.xlsx> [--apply]");
  console.error("     npx tsx scripts/importar-historico-cobros.ts --plantilla historico.xlsx");
  process.exit(1);
}

const dbUrl =
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  null;

// ---------- Tipos ----------
type Row = Record<string, unknown>;

interface VentaImport {
  fila: number;
  idVenta: string;
  ruc: string | null;
  documento: string | null;
  razonSocial: string;
  fechaVenta: string; // YYYY-MM-DD
  descripcion: string | null;
  moneda: "GS" | "USD";
  total: number;
  cuotas: number;
  montoCuota: number | null;
  primeraCuota: string | null; // YYYY-MM-DD
  intervalo: number;
}

interface PagoImport {
  fila: number;
  idVenta: string;
  numeroCuota: number;
  fechaPago: string; // YYYY-MM-DD
  monto: number;
  metodo: string;
  referencia: string | null;
}

// ---------- Utilidades ----------
function quoteIdent(s: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error(`schema inválido: ${s}`);
  return `"${s}"`;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Acepta Date (Excel), número serial, o texto dd/mm/aaaa | aaaa-mm-dd. Devuelve YYYY-MM-DD. */
function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lee una celda probando varios nombres de header (tolerante a acentos/variantes). */
function cell(row: Row, ...names: string[]): unknown {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(norm(k), row[k]);
  for (const n of names) {
    const hit = map.get(norm(n));
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// ---------- Plantilla ----------
function generarPlantilla(destino: string) {
  const ventas = [
    {
      "ID Venta": "V001",
      "RUC/CI": "1234567",
      "Razón social": "Juan Pérez",
      "Fecha venta": "15/01/2026",
      "Descripción": "Lote 12 - Barrio San José",
      "Moneda": "GS",
      "Total": 130000000,
      "Cantidad cuotas": 130,
      "Monto por cuota": 1000000,
      "Primera cuota vence": "15/02/2026",
      "Cada (días)": 30,
    },
  ];
  const pagos = [
    { "ID Venta": "V001", "N° cuota": 1, "Fecha pago": "15/02/2026", "Monto": 1000000, "Método": "efectivo", "Referencia": "" },
    { "ID Venta": "V001", "N° cuota": 2, "Fecha pago": "15/03/2026", "Monto": 1000000, "Método": "transferencia", "Referencia": "" },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas), "Ventas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagos), "Pagos");
  XLSX.writeFile(wb, path.resolve(destino));
  console.log(`✅ Plantilla creada en: ${path.resolve(destino)}`);
  console.log(`   Llená la hoja "Ventas" (una fila por venta) y "Pagos" (una fila por pago recibido).`);
  console.log(`   Después corré:  npx tsx scripts/importar-historico-cobros.ts ${destino}`);
}

// ---------- Parseo del Excel ----------
function parseExcel(ruta: string): { ventas: VentaImport[]; pagos: PagoImport[]; errores: string[] } {
  const wb = XLSX.readFile(path.resolve(ruta), { cellDates: true });
  const errores: string[] = [];

  const wsV = wb.Sheets["Ventas"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!wsV) throw new Error('No se encontró la hoja "Ventas".');
  const rowsV = XLSX.utils.sheet_to_json<Row>(wsV, { defval: null });

  const ventas: VentaImport[] = [];
  const idsVistos = new Set<string>();
  rowsV.forEach((r, i) => {
    const fila = i + 2; // +1 header, +1 base-1
    const idVenta = str(cell(r, "ID Venta", "IDVenta", "ID", "Id venta"));
    const razonSocial = str(cell(r, "Razón social", "Razon social", "Cliente", "Nombre"));
    if (!idVenta && !razonSocial) return; // fila vacía
    if (!idVenta) { errores.push(`Ventas fila ${fila}: falta "ID Venta".`); return; }
    if (idsVistos.has(idVenta)) { errores.push(`Ventas fila ${fila}: "ID Venta" duplicado (${idVenta}).`); return; }
    idsVistos.add(idVenta);
    if (!razonSocial) { errores.push(`Ventas fila ${fila}: falta "Razón social".`); return; }

    const fechaVenta = toISODate(cell(r, "Fecha venta", "Fecha", "Fecha de venta"));
    if (!fechaVenta) { errores.push(`Ventas fila ${fila}: "Fecha venta" inválida.`); return; }

    const total = num(cell(r, "Total", "Monto total", "Importe"));
    if (!Number.isFinite(total) || total <= 0) { errores.push(`Ventas fila ${fila}: "Total" inválido.`); return; }

    let cuotas = Math.trunc(num(cell(r, "Cantidad cuotas", "Cuotas", "Cant cuotas")));
    if (!Number.isFinite(cuotas) || cuotas < 1) cuotas = 1;
    if (cuotas > MAX_CUOTAS) { errores.push(`Ventas fila ${fila}: cuotas (${cuotas}) supera el máximo ${MAX_CUOTAS}.`); return; }

    const montoCuotaRaw = num(cell(r, "Monto por cuota", "Monto cuota", "Cuota"));
    const montoCuota = Number.isFinite(montoCuotaRaw) && montoCuotaRaw > 0 ? Math.round(montoCuotaRaw) : null;

    const intervaloRaw = Math.trunc(num(cell(r, "Cada (días)", "Cada dias", "Intervalo", "Frecuencia")));
    const intervalo = Number.isFinite(intervaloRaw) && intervaloRaw > 0 ? intervaloRaw : 30;

    const monedaRaw = str(cell(r, "Moneda")).toUpperCase();
    const moneda: "GS" | "USD" = monedaRaw === "USD" ? "USD" : "GS";

    ventas.push({
      fila,
      idVenta,
      ruc: str(cell(r, "RUC/CI", "RUC", "RUC / CI")) || null,
      documento: str(cell(r, "CI", "Documento", "Cédula", "Cedula")) || str(cell(r, "RUC/CI", "RUC", "RUC / CI")) || null,
      razonSocial,
      fechaVenta,
      descripcion: str(cell(r, "Descripción", "Descripcion", "Detalle")) || null,
      moneda,
      total: Math.round(total),
      cuotas,
      montoCuota,
      primeraCuota: toISODate(cell(r, "Primera cuota vence", "Primera cuota", "Primer vencimiento")),
      intervalo,
    });
  });

  const pagos: PagoImport[] = [];
  const wsP = wb.Sheets["Pagos"];
  if (wsP) {
    const rowsP = XLSX.utils.sheet_to_json<Row>(wsP, { defval: null });
    rowsP.forEach((r, i) => {
      const fila = i + 2;
      const idVenta = str(cell(r, "ID Venta", "IDVenta", "ID"));
      if (!idVenta) return; // fila vacía
      const numeroCuota = Math.trunc(num(cell(r, "N° cuota", "N cuota", "Nro cuota", "Cuota", "Numero cuota")));
      if (!Number.isFinite(numeroCuota) || numeroCuota < 1) { errores.push(`Pagos fila ${fila}: "N° cuota" inválido.`); return; }
      const fechaPago = toISODate(cell(r, "Fecha pago", "Fecha", "Fecha de pago"));
      if (!fechaPago) { errores.push(`Pagos fila ${fila}: "Fecha pago" inválida.`); return; }
      const monto = num(cell(r, "Monto", "Importe", "Pago"));
      if (!Number.isFinite(monto) || monto <= 0) { errores.push(`Pagos fila ${fila}: "Monto" inválido.`); return; }
      const metodoRaw = str(cell(r, "Método", "Metodo", "Forma de pago")).toLowerCase();
      const metodo = ["efectivo", "transferencia", "tarjeta", "cheque", "otro"].includes(metodoRaw) ? metodoRaw : "efectivo";
      pagos.push({
        fila,
        idVenta,
        numeroCuota,
        fechaPago,
        monto: Math.round(monto),
        metodo,
        referencia: str(cell(r, "Referencia", "Ref", "Comprobante")) || null,
      });
    });
  }

  // Validar que cada pago tenga su venta.
  for (const p of pagos) {
    if (!idsVistos.has(p.idVenta)) errores.push(`Pagos fila ${p.fila}: "ID Venta" ${p.idVenta} no existe en la hoja Ventas.`);
  }

  return { ventas, pagos, errores };
}

// ---------- Generación de cuotas (misma lógica que la app) ----------
interface CuotaPlan {
  numeroCuota: number;
  totalCuotas: number;
  monto: number;
  fechaVencimiento: string;
}
function planCuotas(v: VentaImport): CuotaPlan[] {
  const n = Math.max(1, Math.min(MAX_CUOTAS, v.cuotas));
  const cuotaMonto = v.montoCuota && v.montoCuota > 0 ? v.montoCuota : Math.round(v.total / n);
  let baseFecha = v.primeraCuota ?? addDaysISO(v.fechaVenta, v.intervalo);
  const plan: CuotaPlan[] = [];
  let acumulado = 0;
  for (let i = 1; i <= n; i++) {
    const monto = i < n ? cuotaMonto : Math.round(v.total - acumulado);
    acumulado += monto;
    plan.push({ numeroCuota: i, totalCuotas: n, monto, fechaVencimiento: baseFecha });
    baseFecha = addDaysISO(baseFecha, v.intervalo);
  }
  return plan;
}

// ---------- Main ----------
async function main() {
  const { ventas, pagos, errores } = parseExcel(file!);

  console.log(`\n=== Importación de histórico (${apply ? "APLICAR" : "PRUEBA — no escribe"}) ===`);
  console.log(`Archivo: ${path.resolve(file!)}`);
  console.log(`Ventas leídas: ${ventas.length} · Pagos leídos: ${pagos.length}`);

  if (errores.length) {
    console.error(`\n❌ Se encontraron ${errores.length} error(es). Corregí el Excel y volvé a correr:\n`);
    for (const e of errores) console.error(`   • ${e}`);
    process.exit(1);
  }

  if (!ventas.length) {
    console.error("No hay ventas para importar.");
    process.exit(1);
  }

  // Resumen de lo que se generaría (no necesita base de datos).
  let totalCuotasPrev = 0;
  for (const v of ventas) totalCuotasPrev += planCuotas(v).length;
  const sumVentas = ventas.reduce((a, v) => a + v.total, 0);
  const sumPagos = pagos.reduce((a, p) => a + p.monto, 0);
  console.log(`Cuotas a generar: ${totalCuotasPrev}`);
  console.log(`Total ventas: ${sumVentas.toLocaleString("es-PY")} · Total pagos: ${sumPagos.toLocaleString("es-PY")}`);
  for (const v of ventas.slice(0, 3)) {
    const plan = planCuotas(v);
    console.log(`  · ${v.idVenta} ${v.razonSocial} — ${v.cuotas} cuota(s) de ~${plan[0].monto.toLocaleString("es-PY")} desde ${plan[0].fechaVencimiento}`);
  }
  console.log(`✅ Validación del Excel OK (${ventas.length} ventas, ${pagos.length} pagos).`);

  if (!dbUrl) {
    console.log(`\nℹ️  Sin conexión a la base (falta SUPABASE_DB_URL en .env.local).`);
    console.log(`   La validación del Excel pasó. Para resolver la empresa y escribir, configurá la conexión.\n`);
    return;
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // Resolver empresa + schema.
    let empresaId = empresaIdForzado;
    let schema = schemaForzado ?? process.env.NEURA_CLIENT_SCHEMA?.trim() ?? null;
    if (!empresaId || !schema) {
      const q = await client.query<{ id: string; nombre_empresa: string | null; data_schema: string | null }>(
        `SELECT id, nombre_empresa, data_schema FROM zentra_erp.empresas
         WHERE lower(coalesce(nombre_empresa,'')) LIKE lower($1) ORDER BY created_at LIMIT 5`,
        [`%${empresaNombre}%`]
      );
      if (!q.rows.length) throw new Error(`No se encontró ninguna empresa que coincida con "${empresaNombre}" en zentra_erp.empresas.`);
      if (q.rows.length > 1) {
        console.error(`\n⚠️  Más de una empresa coincide con "${empresaNombre}":`);
        for (const r of q.rows) console.error(`   • ${r.id} | ${r.nombre_empresa} | schema=${r.data_schema}`);
        throw new Error("Especificá cuál con --empresa-id <uuid>.");
      }
      empresaId = empresaId ?? q.rows[0].id;
      schema = schema ?? q.rows[0].data_schema;
      console.log(`Empresa: ${q.rows[0].nombre_empresa} (${empresaId}) · schema: ${schema}`);
    }
    if (!schema) throw new Error("No se pudo resolver el schema (usá --schema o seteá NEURA_CLIENT_SCHEMA).");
    const S = quoteIdent(schema);

    if (!apply) {
      console.log(`\n✅ PRUEBA OK (empresa y schema resueltos). Nada se escribió. Para aplicar agregá --apply\n`);
      return;
    }

    // ---------- APLICAR (transacción única) ----------
    await client.query("BEGIN");

    const cuentaIdPorClave = new Map<string, string>(); // `${idVenta}#${numeroCuota}` -> cuenta_por_cobrar_id
    let ventasCreadas = 0, clientesCreados = 0, cuotasCreadas = 0, pagosCreados = 0;

    for (const v of ventas) {
      // Idempotencia: numero_control estable por idVenta.
      const numeroControl = `HIST-${v.idVenta}`;
      const yaExiste = await client.query(`SELECT id FROM ${S}.ventas WHERE empresa_id=$1 AND numero_control=$2 LIMIT 1`, [empresaId, numeroControl]);
      if (yaExiste.rows.length) {
        throw new Error(`La venta ${v.idVenta} (numero_control ${numeroControl}) ya existe. Abortando para no duplicar. Borrá las previas o cambiá los ID.`);
      }

      // Cliente: match por ruc o documento; si no, crear.
      let clienteId: string | null = null;
      if (v.ruc || v.documento) {
        const m = await client.query(
          `SELECT id FROM ${S}.clientes WHERE empresa_id=$1 AND (($2::text <> '' AND ruc=$2) OR ($3::text <> '' AND documento=$3)) LIMIT 1`,
          [empresaId, v.ruc ?? "", v.documento ?? ""]
        );
        if (m.rows.length) clienteId = m.rows[0].id;
      }
      if (!clienteId) {
        const ins = await client.query(
          `INSERT INTO ${S}.clientes (empresa_id, empresa, nombre_contacto, ruc, documento, condicion_pago)
           VALUES ($1,$2,$2,$3,$4,'CREDITO') RETURNING id`,
          [empresaId, v.razonSocial, v.ruc, v.documento]
        );
        clienteId = ins.rows[0].id;
        clientesCreados++;
      }

      // Venta a crédito (fecha histórica).
      const insV = await client.query(
        `INSERT INTO ${S}.ventas (empresa_id, cliente_id, numero_control, moneda, subtotal, monto_iva, total, estado, tipo_venta, fecha, created_at)
         VALUES ($1,$2,$3,$4,$5,0,$5,'completada','CREDITO',$6,$6) RETURNING id`,
        [empresaId, clienteId, numeroControl, v.moneda === "USD" ? "USD" : "GS", v.total, `${v.fechaVenta}T12:00:00Z`]
      );
      const ventaId = insV.rows[0].id;
      ventasCreadas++;

      // Cuotas.
      const plan = planCuotas(v);
      const monedaCxc = v.moneda === "USD" ? "USD" : "PYG";
      for (const c of plan) {
        const insC = await client.query(
          `INSERT INTO ${S}.cuentas_por_cobrar
             (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas, observaciones)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'pendiente',$9,$10,$11) RETURNING id`,
          [empresaId, clienteId, ventaId, `${numeroControl}-C${c.numeroCuota}`, v.fechaVenta, c.fechaVencimiento, monedaCxc, c.monto, c.numeroCuota, c.totalCuotas, v.descripcion]
        );
        cuentaIdPorClave.set(`${v.idVenta}#${c.numeroCuota}`, insC.rows[0].id);
        cuotasCreadas++;
      }
    }

    // Pagos: aplicar y reducir saldo.
    const pagosPorCuenta = new Map<string, number>(); // cuentaId -> pagado acumulado
    for (const p of pagos) {
      const cuentaId = cuentaIdPorClave.get(`${p.idVenta}#${p.numeroCuota}`);
      if (!cuentaId) throw new Error(`Pago (fila ${p.fila}): no existe la cuota ${p.numeroCuota} de la venta ${p.idVenta}.`);
      const cxc = await client.query<{ cliente_id: string; venta_id: string; total: number }>(
        `SELECT cliente_id, venta_id, total FROM ${S}.cuentas_por_cobrar WHERE id=$1`, [cuentaId]
      );
      const row = cxc.rows[0];
      await client.query(
        `INSERT INTO ${S}.cobros_clientes (empresa_id, cliente_id, cuenta_por_cobrar_id, venta_id, fecha_pago, monto, metodo_pago, referencia)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [empresaId, row.cliente_id, cuentaId, row.venta_id, `${p.fechaPago}T12:00:00Z`, p.monto, p.metodo, p.referencia]
      );
      pagosCreados++;
      pagosPorCuenta.set(cuentaId, (pagosPorCuenta.get(cuentaId) ?? 0) + p.monto);
    }

    // Recalcular saldo/estado de cada cuota tocada por pagos.
    for (const [cuentaId, pagado] of pagosPorCuenta) {
      const cxc = await client.query<{ total: number }>(`SELECT total FROM ${S}.cuentas_por_cobrar WHERE id=$1`, [cuentaId]);
      const total = Number(cxc.rows[0].total);
      const saldo = Math.max(0, total - pagado);
      const estado = saldo <= 0 ? "pagado" : pagado > 0 ? "parcial" : "pendiente";
      await client.query(`UPDATE ${S}.cuentas_por_cobrar SET saldo=$2, estado=$3, updated_at=now() WHERE id=$1`, [cuentaId, saldo, estado]);
    }

    await client.query("COMMIT");
    console.log(`\n✅ IMPORTACIÓN COMPLETA`);
    console.log(`   Clientes creados: ${clientesCreados}`);
    console.log(`   Ventas creadas:   ${ventasCreadas}`);
    console.log(`   Cuotas creadas:   ${cuotasCreadas}`);
    console.log(`   Pagos aplicados:  ${pagosCreados}\n`);
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    console.error(`\n❌ Error — se revirtió TODO (no quedó nada a medias):`);
    console.error(`   ${e instanceof Error ? e.message : e}\n`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
