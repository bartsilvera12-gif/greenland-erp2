"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import SearchableSelect, { type SearchableOption } from "@/components/ui/SearchableSelect";

type Moneda = "GS" | "USD";
type TipoIva = "EXENTA" | "5%" | "10%";
type TipoVenta = "CONTADO" | "CREDITO";

interface Servicio {
  descripcion: string;
  monto: number;
}

interface ClienteOpt {
  id: string;
  empresa: string | null;
  nombre_contacto: string | null;
  ruc: string | null;
  documento: string | null;
}

interface PropiedadOpt {
  id: string;
  codigo: string | null;
  titulo: string;
  ciudad: string | null;
  precio: number | null;
  moneda: string | null;
  modalidad: string | null;
  cuotas_cantidad: number | null;
  cuota_monto: number | null;
  estado: string | null;
}

function ivaRate(t: TipoIva): number {
  return t === "5%" ? 0.05 : t === "10%" ? 0.10 : 0;
}
function fmtMonto(v: number, m: Moneda): string {
  const p = m === "USD" ? "USD" : "Gs.";
  return `${p} ${Math.round(v).toLocaleString("es-PY")}`;
}
function parseMonto(v: string): number {
  const n = Number(String(v).replace(/\./g, "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function fmtThousand(v: number | ""): string {
  if (v === "" || v == null || !Number.isFinite(v)) return "";
  return Number(v).toLocaleString("es-PY");
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

function SegmentedControl<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex divide-x divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            value === opt.value ? "bg-[#4FAEB2] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{children}</h2>;
}

function Total({
  label, value, moneda, highlight, muted,
}: { label: string; value: number; moneda: Moneda; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${
      highlight ? "border-[#4FAEB2] bg-[#ECFEFF]"
      : muted ? "border-slate-100 bg-slate-50"
      : "border-slate-200 bg-white"
    }`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-base font-semibold ${highlight ? "text-[#3F8E91]" : "text-slate-800"}`}>
        {fmtMonto(value, moneda)}
      </div>
    </div>
  );
}

export default function NuevaVentaPage() {
  const router = useRouter();

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [propiedades, setPropiedades] = useState<PropiedadOpt[]>([]);
  const [propiedadId, setPropiedadId] = useState<string>("");

  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [documento, setDocumento] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("GS");
  const [tipoIva, setTipoIva] = useState<TipoIva>("10%");
  const [servicios, setServicios] = useState<Servicio[]>([{ descripcion: "", monto: 0 }]);
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>("CONTADO");
  const [cuotasCantidad, setCuotasCantidad] = useState<number>(12);
  const [cuotaMonto, setCuotaMonto] = useState<number | "">("");
  const [fechaPrimeraCuota, setFechaPrimeraCuota] = useState<string>("");
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithSupabaseSession("/api/clientes", { cache: "no-store" });
        const json = await res.json();
        const arr = Array.isArray(json?.data) ? (json.data as ClienteOpt[]) : [];
        setClientes(arr);
      } catch { /* sin clientes */ }
    })();
    void (async () => {
      try {
        const res = await fetchWithSupabaseSession("/api/propiedades", { cache: "no-store" });
        const json = await res.json();
        const arr = Array.isArray(json?.data) ? (json.data as PropiedadOpt[]) : [];
        // Solo disponibles / reservadas (no vendidas/inactivas)
        setPropiedades(arr.filter((p) => !p.estado || ["disponible", "reservada"].includes(String(p.estado).toLowerCase())));
      } catch { /* sin propiedades */ }
    })();
  }, []);

  function onPropiedadSelected(id: string) {
    setPropiedadId(id);
    if (!id) return;
    const p = propiedades.find((x) => x.id === id);
    if (!p) return;
    // Pre-completa el primer servicio con titulo + precio
    setServicios([{ descripcion: p.titulo + (p.codigo ? ` (${p.codigo})` : ""), monto: p.precio || 0 }]);
    // Modalidad: si la propiedad esta en Credito y tiene cuotas, precarga
    const mod = String(p.modalidad || "").toLowerCase();
    if (mod === "credito" && p.cuotas_cantidad) {
      setTipoVenta("CREDITO");
      setCuotasCantidad(p.cuotas_cantidad);
      if (p.cuota_monto) setCuotaMonto(p.cuota_monto);
    } else if (mod === "contado") {
      setTipoVenta("CONTADO");
    }
    // Moneda
    if (p.moneda === "USD") setMoneda("USD");
    else if (p.moneda === "PYG" || p.moneda === "GS") setMoneda("GS");
  }

  function onClienteSelected(id: string) {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c) {
      setRazonSocial((c.empresa ?? c.nombre_contacto ?? "").trim());
      setRuc(c.ruc ?? "");
      setDocumento(c.documento ?? "");
    }
  }

  const { subtotal, montoIva, total } = useMemo(() => {
    const sub = servicios.reduce((acc, s) => acc + (Number(s.monto) || 0), 0);
    const iva = sub * ivaRate(tipoIva);
    return { subtotal: sub, montoIva: iva, total: sub };
  }, [servicios, tipoIva]);

  function updateServicio(i: number, patch: Partial<Servicio>) {
    setServicios((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addServicio() {
    setServicios((arr) => [...arr, { descripcion: "", monto: 0 }]);
  }
  function removeServicio(i: number) {
    setServicios((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!razonSocial.trim()) { setErr("Ingresá la razón social del cliente."); return; }
    const valid = servicios
      .map((s) => ({ descripcion: s.descripcion.trim(), monto: Number(s.monto) || 0 }))
      .filter((s) => s.descripcion && s.monto > 0);
    if (!valid.length) { setErr("Cargá al menos una línea con descripción y monto > 0."); return; }
    if (tipoVenta === "CREDITO" && cuotasCantidad < 1) { setErr("Cantidad de cuotas inválida"); return; }

    setSaving(true);
    try {
      const res = await fetchWithSupabaseSession("/api/ventas/servicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: clienteId || null,
          cliente_razon_social: razonSocial.trim(),
          cliente_ruc: ruc.trim() || null,
          cliente_documento: documento.trim() || null,
          moneda,
          tipo_iva: tipoIva,
          servicios: valid,
          tipo_venta: tipoVenta,
          cuotas_cantidad: tipoVenta === "CREDITO" ? cuotasCantidad : undefined,
          cuota_monto: tipoVenta === "CREDITO" && cuotaMonto ? Number(cuotaMonto) : undefined,
          fecha_primera_cuota: tipoVenta === "CREDITO" ? fechaPrimeraCuota || undefined : undefined,
          intervalo_dias: tipoVenta === "CREDITO" ? intervaloDias : undefined,
          observaciones: observaciones.trim() || null,
          propiedad_id: propiedadId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setErr(json?.error ?? "No se pudo crear la venta");
        setSaving(false);
        return;
      }
      const nuevaId = json.data?.venta?.id;
      if (nuevaId) {
        // Abre el recibo en una pestaña nueva con auto-print
        window.open(`/api/ventas/${nuevaId}/recibo?auto=1`, "_blank");
      }
      router.push("/ventas");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <header className="mb-6">
        <button
          type="button"
          onClick={() => router.push("/ventas")}
          className="mb-2 inline-flex text-xs font-medium text-slate-500 hover:text-[#3F8E91]"
        >
          ← Volver a ventas
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nueva venta</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cargá la razón social, los servicios y el IVA aplicable.
        </p>
      </header>

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>
        ) : null}

        <div>
          <GroupHeader>Moneda</GroupHeader>
          <div className="mt-2">
            <SegmentedControl<Moneda>
              value={moneda}
              onChange={setMoneda}
              options={[
                { value: "GS", label: "Guaraníes" },
                { value: "USD", label: "Dólares" },
              ]}
            />
          </div>
        </div>

        <div>
          <GroupHeader>Tipo de IVA</GroupHeader>
          <p className="mt-1 text-[11px] text-slate-400">El IVA está incluido en el monto cargado.</p>
          <div className="mt-2">
            <SegmentedControl<TipoIva>
              value={tipoIva}
              onChange={setTipoIva}
              options={[
                { value: "EXENTA", label: "Exenta" },
                { value: "5%", label: "5%" },
                { value: "10%", label: "10%" },
              ]}
            />
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Cliente — selector con buscador */}
        <div>
          <label className={labelClass}>Buscar cliente existente</label>
          <SearchableSelect
            value={clienteId}
            onChange={onClienteSelected}
            options={[
              { id: "", label: "— Cliente nuevo (cargar manual) —" },
              ...clientes.map((c): SearchableOption => {
                const n = (c.empresa ?? c.nombre_contacto ?? "Cliente").trim();
                const doc = c.ruc || c.documento || "";
                return { id: c.id, label: n, sublabel: doc || undefined };
              }),
            ]}
            placeholder="Cliente nuevo (cargar manual)"
            emptyText="Sin clientes que coincidan"
          />
        </div>

        {/* Propiedad — opcional, con buscador */}
        <div>
          <label className={labelClass}>Propiedad vendida (opcional)</label>
          <SearchableSelect
            value={propiedadId}
            onChange={onPropiedadSelected}
            options={[
              { id: "", label: "— No vincular a una propiedad —" },
              ...propiedades.map((p): SearchableOption => {
                const partes = [p.ciudad, p.precio ? `Gs. ${Math.round(p.precio).toLocaleString("es-PY")}` : null].filter(Boolean) as string[];
                return { id: p.id, label: p.titulo, sublabel: partes.join(" · ") || undefined };
              }),
            ]}
            placeholder="No vincular a una propiedad"
            emptyText="Sin propiedades que coincidan"
          />
          {propiedadId ? (
            <p className="mt-1 text-[11px] text-emerald-700">Se autocompletó descripción, monto, modalidad y cuotas desde la propiedad.</p>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">Si vendés un lote, elegilo acá: se autocompletan datos y queda linkeado en el recibo.</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Razón social *</label>
            <input
              className={inputClass}
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Ej: Constructora Aurora S.A."
              required
            />
          </div>
          <div>
            <label className={labelClass}>Nº de RUC</label>
            <input
              className={inputClass}
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              placeholder="Ej: 80012345-6"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>CI / Documento</label>
            <input
              className={inputClass}
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Ej: 1234567"
            />
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <GroupHeader>Descripción de servicios</GroupHeader>
            <button
              type="button"
              onClick={addServicio}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + Agregar línea
            </button>
          </div>
          <div className="space-y-3">
            {servicios.map((s, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
                <div>
                  <label className={labelClass}>Descripción</label>
                  <input
                    className={inputClass}
                    value={s.descripcion}
                    onChange={(e) => updateServicio(i, { descripcion: e.target.value })}
                    placeholder="Ej: Valor de la casa / Escribanía / Gastos varios"
                  />
                </div>
                <div>
                  <label className={labelClass}>Monto</label>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={s.monto > 0 ? Number(s.monto).toLocaleString("es-PY") : ""}
                    onChange={(e) => updateServicio(i, { monto: parseMonto(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeServicio(i)}
                  disabled={servicios.length <= 1}
                  className="h-[38px] rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed sm:self-end"
                  title="Quitar línea"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        <div>
          <GroupHeader>Totales</GroupHeader>
          <p className="mt-1 text-[11px] text-slate-400">
            El total es igual al monto cargado — el IVA mostrado es informativo y ya está incluido.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Total label="Subtotal (con IVA)" value={subtotal} moneda={moneda} />
            <Total
              label={tipoIva === "EXENTA" ? "IVA (no aplica)" : `IVA ${tipoIva} incluido`}
              value={montoIva}
              moneda={moneda}
              muted={tipoIva === "EXENTA"}
            />
            <Total label="Total a cobrar" value={total} moneda={moneda} highlight />
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Tipo de venta + cuotas (extensión Green Land) */}
        <div>
          <GroupHeader>Tipo de venta</GroupHeader>
          <div className="mt-2 max-w-md">
            <SegmentedControl<TipoVenta>
              value={tipoVenta}
              onChange={setTipoVenta}
              options={[
                { value: "CONTADO", label: "Contado" },
                { value: "CREDITO", label: "Crédito (cuotas)" },
              ]}
            />
          </div>
          {tipoVenta === "CREDITO" && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 rounded-lg bg-slate-50 p-4">
              <div>
                <label className={labelClass}>Cantidad de cuotas</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  value={cuotasCantidad === 0 ? "" : String(cuotasCantidad)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setCuotasCantidad(raw === "" ? 0 : Math.min(120, Number(raw)));
                  }}
                  onBlur={() => { if (cuotasCantidad < 1) setCuotasCantidad(1); }}
                />
              </div>
              <div>
                <label className={labelClass}>Monto por cuota</label>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  placeholder={cuotasCantidad > 0 ? Math.round(total / cuotasCantidad).toLocaleString("es-PY") : ""}
                  value={fmtThousand(cuotaMonto)}
                  onChange={(e) => {
                    const v = parseMonto(e.target.value);
                    setCuotaMonto(v > 0 ? v : "");
                  }}
                />
                <p className="mt-1 text-[10px] text-slate-400">Vacío = se reparte el total automáticamente</p>
              </div>
              <div>
                <label className={labelClass}>Primera cuota vence</label>
                <input
                  type="date"
                  className={inputClass}
                  value={fechaPrimeraCuota}
                  onChange={(e) => setFechaPrimeraCuota(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Cada (días)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  value={intervaloDias === 0 ? "" : String(intervaloDias)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setIntervaloDias(raw === "" ? 0 : Number(raw));
                  }}
                  onBlur={() => { if (intervaloDias < 1) setIntervaloDias(30); }}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Observaciones</label>
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas internas (opcional)"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar venta"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/ventas")}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
