"use client";

import { useState } from "react";

export type PropiedadFormValues = {
  codigo: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  operacion: string;
  estado: string;
  ciudad: string;
  barrio: string;
  direccion: string;
  lat: number | null;
  lng: number | null;
  precio: number | null;
  moneda: string;
  dormitorios: number | null;
  banos: number | null;
  cocheras: number | null;
  superficie_m2: number | null;
  terreno_m2: number | null;
  destacada: boolean;
  visible_web: boolean;
  activo: boolean;
};

export const EMPTY_FORM: PropiedadFormValues = {
  codigo: "",
  titulo: "",
  descripcion: "",
  tipo: "casa",
  operacion: "alquiler",
  estado: "disponible",
  ciudad: "",
  barrio: "",
  direccion: "",
  lat: null,
  lng: null,
  precio: null,
  moneda: "PYG",
  dormitorios: null,
  banos: null,
  cocheras: null,
  superficie_m2: null,
  terreno_m2: null,
  destacada: false,
  visible_web: true,
  activo: true,
};

const TIPOS = ["casa", "departamento", "duplex", "terreno", "local", "oficina", "deposito", "otro"];
const OPERACIONES = ["alquiler", "venta", "alquiler_temporario"];
const ESTADOS = ["disponible", "reservada", "alquilada", "vendida", "inactiva"];

function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function PropiedadForm({
  initial,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial: PropiedadFormValues;
  submitting: boolean;
  onSubmit: (values: PropiedadFormValues) => void | Promise<void>;
  submitLabel: string;
}) {
  const [values, setValues] = useState<PropiedadFormValues>(initial);

  function up<K extends keyof PropiedadFormValues>(key: K, val: PropiedadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.titulo.trim()) {
      alert("El título es obligatorio");
      return;
    }
    void onSubmit(values);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]";
  const labelClass = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Datos principales</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>Título *</label>
            <input
              className={inputClass}
              required
              value={values.titulo}
              onChange={(e) => up("titulo", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Código</label>
            <input
              className={inputClass}
              value={values.codigo}
              onChange={(e) => up("codigo", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Tipo</label>
            <select
              className={inputClass}
              value={values.tipo}
              onChange={(e) => up("tipo", e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Operación</label>
            <select
              className={inputClass}
              value={values.operacion}
              onChange={(e) => up("operacion", e.target.value)}
            >
              {OPERACIONES.map((o) => (
                <option key={o} value={o}>{o.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Estado</label>
            <select
              className={inputClass}
              value={values.estado}
              onChange={(e) => up("estado", e.target.value)}
            >
              {ESTADOS.map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Descripción</label>
            <textarea
              className={`${inputClass} min-h-24`}
              value={values.descripcion}
              onChange={(e) => up("descripcion", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Ubicación</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Ciudad</label>
            <input
              className={inputClass}
              value={values.ciudad}
              onChange={(e) => up("ciudad", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Barrio</label>
            <input
              className={inputClass}
              value={values.barrio}
              onChange={(e) => up("barrio", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Dirección</label>
            <input
              className={inputClass}
              value={values.direccion}
              onChange={(e) => up("direccion", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Latitud</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={values.lat ?? ""}
              onChange={(e) => up("lat", toNum(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Longitud</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={values.lng ?? ""}
              onChange={(e) => up("lng", toNum(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Precio y características</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Precio</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={values.precio ?? ""}
              onChange={(e) => up("precio", toNum(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Moneda</label>
            <select
              className={inputClass}
              value={values.moneda}
              onChange={(e) => up("moneda", e.target.value)}
            >
              <option value="PYG">PYG</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div />
          <div>
            <label className={labelClass}>Dormitorios</label>
            <input
              type="number"
              className={inputClass}
              value={values.dormitorios ?? ""}
              onChange={(e) => up("dormitorios", toNum(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Baños</label>
            <input
              type="number"
              className={inputClass}
              value={values.banos ?? ""}
              onChange={(e) => up("banos", toNum(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Cocheras</label>
            <input
              type="number"
              className={inputClass}
              value={values.cocheras ?? ""}
              onChange={(e) => up("cocheras", toNum(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Superficie (m²)</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={values.superficie_m2 ?? ""}
              onChange={(e) => up("superficie_m2", toNum(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Terreno (m²)</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={values.terreno_m2 ?? ""}
              onChange={(e) => up("terreno_m2", toNum(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Visibilidad</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.activo}
              onChange={(e) => up("activo", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Activo
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.visible_web}
              onChange={(e) => up("visible_web", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Visible en web
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.destacada}
              onChange={(e) => up("destacada", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Destacada
          </label>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {submitting ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
