/* Genera un SQL idempotente que carga las propiedades y promociones de la
 * landing greenlandpy.com en greenlanderp.{propiedades, promociones}.
 * Lee:
 *   - C:/Users/Neura/greenland-landing/data/recovered/lotes.json
 *   - promos hardcoded del index.html (definido abajo)
 * Escribe:
 *   - supabase/migrations/20260628120000_greenland_seed_landing.sql
 */
const fs = require("fs");
const path = require("path");

const LOTES = JSON.parse(
  fs.readFileSync("C:/Users/Neura/greenland-landing/data/recovered/lotes.json", "utf8"),
);

// Snapshot de promos extraído del index.html (hardcoded en el repo de landing).
const PROMOS = [
  {
    titulo: "Plan ECO",
    badge: "30%",
    descripcion:
      "Plan ECO desde Gs. 1.000.000 con refuerzos y Gs. 1.450.000 sin refuerzos. Posesión inmediata.",
    banner_url: "https://greenlandpy.com/assets/images/promo-plan-eco.jpg",
    orden: 1,
  },
  {
    titulo: "Con la Cooperativa Universitaria 30%",
    badge: "30%",
    descripcion:
      "¡Atención Socios de la Universitaria! Su próxima gran inversión tiene un 30% de descuento exclusivo.",
    banner_url: "https://greenlandpy.com/assets/images/promo-cooperativa.png",
    orden: 2,
  },
  {
    titulo: "Invertí donde la calidad de vida crece",
    badge: "BARRIO CERRADO",
    descripcion:
      "En Las Lomas Country asegurás tu lote en barrio cerrado en Loma Grande, con transferencia inmediata por Gs. 80.000.000.",
    banner_url: "https://greenlandpy.com/assets/images/promo-las-lomas.png",
    orden: 3,
  },
];

function sqlStr(v) {
  if (v == null) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlNum(v) {
  if (v == null || v === "") return "NULL";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "NULL";
}
function sqlBool(v) {
  return v === true ? "true" : "false";
}
function sqlJsonb(obj) {
  return sqlStr(JSON.stringify(obj)) + "::jsonb";
}

function mapEstado(estadoLanding) {
  const e = String(estadoLanding || "").toLowerCase();
  if (e.includes("disponible")) return "disponible";
  if (e.includes("reserv")) return "reservada";
  if (e.includes("vendid") || e.includes("entregad")) return "vendida";
  return "disponible";
}

function buildServicios(l) {
  const out = [];
  if (l.aguaPotable) out.push("Agua potable");
  if (l.energiaElectrica) out.push("Energía eléctrica");
  if (l.calle) out.push("Calle");
  if (l.seguridad) out.push("Seguridad 24h");
  if (l.amojonado) out.push("Amojonado");
  if (l.limpio) out.push("Limpio");
  return out;
}

function buildMedidas(l) {
  const dir = (m, linda, calle) => ({
    m: m == null ? null : Number(m) || null,
    linda: linda || null,
    calle: calle || null,
  });
  return {
    norte: dir(l.linderoNorteMedida, l.linderoNorteCon, l.linderoNorteCalle),
    sur: dir(l.linderoSurMedida, l.linderoSurCon, l.linderoSurCalle),
    este: dir(l.linderoEsteMedida, l.linderoEsteCon, l.linderoEsteCalle),
    oeste: dir(l.linderoOesteMedida, l.linderoOesteCon, l.linderoOesteCalle),
  };
}

function buildTitulo(l) {
  const mz = (l.manzana || "").toString().trim();
  const lt = (l.lote || "").toString().trim();
  if (mz && lt) return `Mz. ${mz} · Lote ${lt}`;
  if (mz) return `Mz. ${mz}`;
  if (lt) return `Lote ${lt}`;
  return l.fraccionamiento || "Lote";
}

// Código estable para idempotencia: GL-LOT-{id original del JSON}.
function buildCodigo(l) {
  return `GL-LOT-${l.id}`;
}

const lines = [];
lines.push("-- =============================================================================");
lines.push("-- Green Land · seed inicial de Propiedades y Promociones desde la landing");
lines.push("-- Generado por scripts/generar-seed-landing.js");
lines.push("-- Idempotente: usa el campo `codigo` (GL-LOT-{id}) y `titulo` como llave de");
lines.push("-- inserción. Si la fila ya existe (matchea codigo), no la duplica.");
lines.push("-- =============================================================================");
lines.push("");
lines.push("DO $do$");
lines.push("DECLARE");
lines.push("  v_empresa uuid;");
lines.push("BEGIN");
lines.push("  -- Resuelve la empresa: la única del schema (mono-tenant Green Land).");
lines.push("  SELECT id INTO v_empresa FROM greenlanderp.empresas LIMIT 1;");
lines.push("  IF v_empresa IS NULL THEN RAISE EXCEPTION 'No hay empresa en greenlanderp.empresas'; END IF;");
lines.push("");
lines.push("  -- ---------------- PROPIEDADES ----------------");

for (const l of LOTES) {
  const codigo = buildCodigo(l);
  const titulo = buildTitulo(l);
  const ciudad = (l.fraccionamiento || "").trim() || null;
  const barrio = (l.distrito || "").trim() || null;
  const precio = sqlNum(l.precioTotal);
  const moneda = "PYG";
  const terreno = sqlNum(l.superficie);
  const estado = mapEstado(l.estadoVenta);
  const modalidad = (l.modalidadPago || "").trim() || null;
  const cuotas = l.modalidadPago === "Credito" ? l.cuotas || null : null;
  const cuotaMonto = l.modalidadPago === "Credito" ? l.montoCuota || null : null;
  const servicios = buildServicios(l);
  const medidas = buildMedidas(l);
  const finca = l.finca || null;
  const padron = l.padron || null;
  const ccat = l.cuentaCatastral || null;

  lines.push(
    `  INSERT INTO greenlanderp.propiedades (empresa_id, codigo, titulo, tipo, operacion, estado, ciudad, barrio, precio, moneda, terreno_m2, modalidad, cuotas_cantidad, cuota_monto, servicios, medidas, finca, padron, cuenta_catastral, destacada, visible_web, activo)`,
  );
  lines.push(
    `  SELECT v_empresa, ${sqlStr(codigo)}, ${sqlStr(titulo)}, 'terreno', 'venta', ${sqlStr(estado)}, ${sqlStr(ciudad)}, ${sqlStr(barrio)}, ${precio}, ${sqlStr(moneda)}, ${terreno}, ${sqlStr(modalidad)}, ${sqlNum(cuotas)}, ${sqlNum(cuotaMonto)}, ${sqlJsonb(servicios)}, ${sqlJsonb(medidas)}, ${sqlStr(finca)}, ${sqlStr(padron)}, ${sqlStr(ccat)}, false, true, true`,
  );
  lines.push(
    `  WHERE NOT EXISTS (SELECT 1 FROM greenlanderp.propiedades WHERE empresa_id = v_empresa AND codigo = ${sqlStr(codigo)});`,
  );
}

lines.push("");
lines.push("  -- ---------------- PROMOCIONES ----------------");
for (const p of PROMOS) {
  lines.push(
    `  INSERT INTO greenlanderp.promociones (empresa_id, titulo, descripcion, banner_url, badge, valida_hasta, cta_label, orden, activo, destacada)`,
  );
  lines.push(
    `  SELECT v_empresa, ${sqlStr(p.titulo)}, ${sqlStr(p.descripcion)}, ${sqlStr(p.banner_url)}, ${sqlStr(p.badge)}, '2026-12-31'::date, 'Quiero esta promoción', ${p.orden}, true, false`,
  );
  lines.push(
    `  WHERE NOT EXISTS (SELECT 1 FROM greenlanderp.promociones WHERE empresa_id = v_empresa AND titulo = ${sqlStr(p.titulo)});`,
  );
}

lines.push("");
lines.push("END;");
lines.push("$do$;");
lines.push("");
lines.push("SELECT pg_notify('pgrst', 'reload schema');");

const sql = lines.join("\n") + "\n";

const outPath = path.resolve(
  "C:/Users/Neura/greenland-erp2/supabase/migrations/20260628120000_greenland_seed_landing.sql",
);
fs.writeFileSync(outPath, sql);
console.log("Wrote", outPath, "(", sql.length, "bytes,", LOTES.length, "lotes +", PROMOS.length, "promos)");
