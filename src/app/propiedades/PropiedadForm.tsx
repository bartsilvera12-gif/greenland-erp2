"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

export const SERVICIOS_DISPONIBLES = [
  "Agua potable",
  "Energía eléctrica",
  "Calle",
  "Seguridad 24h",
  "Amojonado",
  "Limpio",
  "Internet/Fibra",
  "Gas",
  "Cloacas",
] as const;

export type Medida = { m: number | null; linda: string; calle: string };

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
  modalidad: string;
  cuotas_cantidad: number | null;
  cuota_monto: number | null;
  servicios: string[];
  medidas: { norte: Medida; sur: Medida; este: Medida; oeste: Medida };
  finca: string;
  padron: string;
  cuenta_catastral: string;
};

const EMPTY_MEDIDA: Medida = { m: null, linda: "", calle: "" };

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
  modalidad: "",
  cuotas_cantidad: null,
  cuota_monto: null,
  servicios: [],
  medidas: {
    norte: { ...EMPTY_MEDIDA },
    sur: { ...EMPTY_MEDIDA },
    este: { ...EMPTY_MEDIDA },
    oeste: { ...EMPTY_MEDIDA },
  },
  finca: "",
  padron: "",
  cuenta_catastral: "",
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
  propiedadId,
  initialImageUrl,
}: {
  initial: PropiedadFormValues;
  submitting: boolean;
  onSubmit: (values: PropiedadFormValues) => void | Promise<void>;
  submitLabel: string;
  /** Si se pasa, se habilita el upload de foto contra /api/propiedades/[id]/imagen */
  propiedadId?: string;
  initialImageUrl?: string | null;
}) {
  const [values, setValues] = useState<PropiedadFormValues>(initial);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function up<K extends keyof PropiedadFormValues>(key: K, val: PropiedadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function upMedida(dir: "norte" | "sur" | "este" | "oeste", patch: Partial<Medida>) {
    setValues((prev) => ({
      ...prev,
      medidas: { ...prev.medidas, [dir]: { ...prev.medidas[dir], ...patch } },
    }));
  }

  function toggleServicio(s: string) {
    setValues((prev) => ({
      ...prev,
      servicios: prev.servicios.includes(s)
        ? prev.servicios.filter((x) => x !== s)
        : [...prev.servicios, s],
    }));
  }

  async function uploadFoto(file: File) {
    if (!propiedadId) return;
    setUploadingImg(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/propiedades/${propiedadId}/imagen`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setImageUrl(json.data?.imagen_url ?? null);
      } else {
        alert(json?.error ?? "No se pudo subir la foto");
      }
    } finally {
      setUploadingImg(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeFoto() {
    if (!propiedadId) return;
    setUploadingImg(true);
    try {
      await fetch(`/api/propiedades/${propiedadId}/imagen`, { method: "DELETE", credentials: "include" });
      setImageUrl(null);
    } finally {
      setUploadingImg(false);
    }
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

      {/* Foto de portada */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Foto de portada</h2>
        {propiedadId ? (
          <div className="flex items-center gap-4">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ImagePlus className="h-7 w-7" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingImg}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
              >
                {uploadingImg ? "Subiendo…" : imageUrl ? "Cambiar foto" : "Subir foto"}
              </button>
              {imageUrl ? (
                <button
                  type="button"
                  onClick={removeFoto}
                  disabled={uploadingImg}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Quitar
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFoto(f);
                }}
              />
              <p className="text-[11px] text-slate-400">JPG, PNG o WebP · máx. 5 MB</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Guardá la propiedad primero, después podrás subir la foto desde acá.</p>
        )}
      </section>

      {/* Servicios e infraestructura */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Servicios e infraestructura</h2>
        <p className="mb-3 text-xs text-slate-500">Marcá los servicios disponibles. Se muestran en el detalle público.</p>
        <div className="flex flex-wrap gap-2">
          {SERVICIOS_DISPONIBLES.map((s) => {
            const active = values.servicios.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleServicio(s)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-[#4FAEB2] bg-[#4FAEB2]/12 text-[#3F8E91]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {active ? "✓ " : ""}
                {s}
              </button>
            );
          })}
        </div>
      </section>

      {/* Modalidad de pago / cuotas */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Modalidad de pago</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Modalidad</label>
            <select
              className={inputClass}
              value={values.modalidad}
              onChange={(e) => up("modalidad", e.target.value)}
            >
              <option value="">—</option>
              <option value="Contado">Contado</option>
              <option value="Credito">Crédito</option>
              <option value="Mixto">Mixto</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Cantidad de cuotas</label>
            <input
              type="number"
              className={inputClass}
              value={values.cuotas_cantidad ?? ""}
              onChange={(e) => up("cuotas_cantidad", toNum(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Monto por cuota</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={values.cuota_monto ?? ""}
              onChange={(e) => up("cuota_monto", toNum(e.target.value))}
            />
          </div>
        </div>
      </section>

      {/* Medidas y linderos */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Medidas y linderos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(["norte", "sur", "este", "oeste"] as const).map((dir) => {
            const m = values.medidas[dir];
            return (
              <div key={dir} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">{dir}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Metros</label>
                    <input
                      type="number"
                      step="any"
                      className={inputClass}
                      value={m.m ?? ""}
                      onChange={(e) => upMedida(dir, { m: toNum(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Linda con</label>
                    <input
                      className={inputClass}
                      value={m.linda}
                      onChange={(e) => upMedida(dir, { linda: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Calle</label>
                    <input
                      className={inputClass}
                      value={m.calle}
                      onChange={(e) => upMedida(dir, { calle: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Datos catastrales */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Datos catastrales</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Finca</label>
            <input className={inputClass} value={values.finca} onChange={(e) => up("finca", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Padrón</label>
            <input className={inputClass} value={values.padron} onChange={(e) => up("padron", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Cuenta catastral</label>
            <input className={inputClass} value={values.cuenta_catastral} onChange={(e) => up("cuenta_catastral", e.target.value)} />
          </div>
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
