"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Moneda = "GS" | "USD";
type TipoIva = "EXENTA" | "5%" | "10%";
type TipoVenta = "CONTADO" | "CREDITO";

interface Servicio {
  descripcion: string;
  monto: number | "";
}

interface ClienteOpt {
  id: string;
  empresa: string | null;
  nombre_contacto: string | null;
  ruc: string | null;
  documento: string | null;
}

function fmt(n: number, m: Moneda) {
  const sym = m === "USD" ? "USD" : "Gs.";
  return `${sym} ${Math.round(n).toLocaleString("es-PY")}`;
}
function num(v: string | number): number {
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function NuevaVentaPage() {
  const router = useRouter();

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [documento, setDocumento] = useState("");

  const [moneda, setMoneda] = useState<Moneda>("GS");
  const [tipoIva, setTipoIva] = useState<TipoIva>("10%");
  const [servicios, setServicios] = useState<Servicio[]>([{ descripcion: "", monto: "" }]);
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>("CONTADO");
  const [cuotasCantidad, setCuotasCantidad] = useState<number>(12);
  const [cuotaMonto, setCuotaMonto] = useState<number | "">("");
  const [fechaPrimeraCuota, setFechaPrimeraCuota] = useState<string>("");
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [observaciones, setObservaciones] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithSupabaseSession("/api/clientes", { cache: "no-store" });
        const json = await res.json();
        const arr = Array.isArray(json?.data) ? (json.data as ClienteOpt[]) : [];
        setClientes(arr);
      } catch { /* sin clientes */ }
    })();
  }, []);

  function onClienteSelected(id: string) {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c) {
      setRazonSocial((c.empresa ?? c.nombre_contacto ?? "").trim());
      setRuc(c.ruc ?? "");
      setDocumento(c.documento ?? "");
    }
  }

  const total = useMemo(
    () => servicios.reduce((acc, s) => acc + (num(s.monto) || 0), 0),
    [servicios],
  );

  function updateServicio(idx: number, patch: Partial<Servicio>) {
    setServicios((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addServicio() {
    setServicios((arr) => [...arr, { descripcion: "", monto: "" }]);
  }
  function removeServicio(idx: number) {
    setServicios((arr) => (arr.length <= 1 ? arr : arr.filter((_, i) => i !== idx)));
  }

  async function save() {
    setError(null);
    if (!razonSocial.trim()) { setError("La razón social del cliente es obligatoria"); return; }
    const valid = servicios
      .map((s) => ({ descripcion: s.descripcion.trim(), monto: num(s.monto) }))
      .filter((s) => s.descripcion && s.monto > 0);
    if (!valid.length) { setError("Cargá al menos una línea con descripción y monto"); return; }
    if (tipoVenta === "CREDITO" && cuotasCantidad < 1) { setError("Cantidad de cuotas inválida"); return; }

    setSaving(true);
    try {
      const res = await fetchWithSupabaseSession("/api/ventas/servicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: clienteId || null,
          cliente_razon_social: razonSocial,
          cliente_ruc: ruc || null,
          cliente_documento: documento || null,
          moneda,
          tipo_iva: tipoIva,
          servicios: valid,
          tipo_venta: tipoVenta,
          cuotas_cantidad: tipoVenta === "CREDITO" ? cuotasCantidad : undefined,
          cuota_monto: tipoVenta === "CREDITO" && cuotaMonto ? num(cuotaMonto) : undefined,
          fecha_primera_cuota: tipoVenta === "CREDITO" ? fechaPrimeraCuota || undefined : undefined,
          intervalo_dias: tipoVenta === "CREDITO" ? intervaloDias : undefined,
          observaciones: observaciones || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo crear la venta");
        setSaving(false);
        return;
      }
      router.push("/ventas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6 max-w-4xl">
      <header>
        <Link href="/ventas" className="text-xs text-slate-500 hover:text-slate-800">← Volver al listado</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Nueva venta</h1>
        <p className="mt-1 text-sm text-slate-500">Cargá las líneas de servicio o cuotas y guardalas.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Cliente</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelCls}>Buscar cliente existente</label>
            <select
              className={inputCls}
              value={clienteId}
              onChange={(e) => onClienteSelected(e.target.value)}
            >
              <option value="">— Cliente nuevo (cargar manual) —</option>
              {clientes.map((c) => {
                const n = (c.empresa ?? c.nombre_contacto ?? "Cliente").trim();
                const doc = c.ruc || c.documento || "";
                return (
                  <option key={c.id} value={c.id}>{n}{doc ? ` · ${doc}` : ""}</option>
                );
              })}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Razón social *</label>
            <input className={inputCls} value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>RUC</label>
            <input className={inputCls} value={ruc} onChange={(e) => setRuc(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>CI / Documento</label>
            <input className={inputCls} value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Descripción de líneas</h2>
          <button type="button" onClick={addServicio} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200">
            <Plus className="h-3 w-3" /> Agregar línea
          </button>
        </div>
        <div className="space-y-2">
          {servicios.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-7">
                <input
                  className={inputCls}
                  placeholder="Ej. Cuota Mz. A · Lote 12"
                  value={s.descripcion}
                  onChange={(e) => updateServicio(i, { descripcion: e.target.value })}
                />
              </div>
              <div className="col-span-4">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="Monto"
                  value={s.monto === "" ? "" : Number(s.monto).toLocaleString("es-PY")}
                  onChange={(e) => updateServicio(i, { monto: num(e.target.value) })}
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeServicio(i)}
                  disabled={servicios.length <= 1}
                  className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
                  title="Quitar línea"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs uppercase tracking-wider text-slate-500">Total</span>
          <span className="text-xl font-bold tabular-nums text-slate-900">{fmt(total, moneda)}</span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Moneda e IVA</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls}>Moneda</label>
            <select className={inputCls} value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="GS">Guaraníes (GS)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo de IVA</label>
            <select className={inputCls} value={tipoIva} onChange={(e) => setTipoIva(e.target.value as TipoIva)}>
              <option value="EXENTA">Exenta</option>
              <option value="5%">IVA 5%</option>
              <option value="10%">IVA 10%</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Tipo de venta</h2>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["CONTADO", "CREDITO"] as TipoVenta[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoVenta(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                tipoVenta === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"
              }`}
            >
              {t === "CONTADO" ? "Contado" : "Crédito"}
            </button>
          ))}
        </div>

        {tipoVenta === "CREDITO" && (
          <div className="grid gap-4 md:grid-cols-4 rounded-lg bg-slate-50 p-4">
            <div>
              <label className={labelCls}>Cantidad de cuotas</label>
              <input
                type="number"
                min={1}
                max={120}
                className={inputCls}
                value={cuotasCantidad}
                onChange={(e) => setCuotasCantidad(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div>
              <label className={labelCls}>Monto por cuota</label>
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder={cuotasCantidad > 0 ? Math.round(total / cuotasCantidad).toLocaleString("es-PY") : ""}
                value={cuotaMonto === "" ? "" : Number(cuotaMonto).toLocaleString("es-PY")}
                onChange={(e) => setCuotaMonto(num(e.target.value) || "")}
              />
              <p className="mt-1 text-[10px] text-slate-400">Vacío = se reparte el total automáticamente</p>
            </div>
            <div>
              <label className={labelCls}>Primera cuota vence</label>
              <input
                type="date"
                className={inputCls}
                value={fechaPrimeraCuota}
                onChange={(e) => setFechaPrimeraCuota(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Cada (días)</label>
              <input
                type="number"
                min={1}
                className={inputCls}
                value={intervaloDias}
                onChange={(e) => setIntervaloDias(Math.max(1, Number(e.target.value) || 30))}
              />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Observaciones</h2>
        <textarea
          rows={3}
          className={inputCls}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />
      </section>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="flex justify-end gap-2">
        <Link href="/ventas" className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancelar
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Crear venta"}
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";
