"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ImagePlus, Calendar } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Promocion = {
  id: string;
  titulo: string;
  descripcion: string | null;
  banner_url: string | null;
  badge: string | null;
  valida_hasta: string | null;
  cta_label: string | null;
  cta_url: string | null;
  orden: number;
  activo: boolean;
  destacada: boolean;
};

type FormState = Omit<Promocion, "id"> & { id?: string };

const EMPTY: FormState = {
  titulo: "",
  descripcion: "",
  banner_url: "",
  badge: "",
  valida_hasta: "",
  cta_label: "Quiero esta promoción",
  cta_url: "",
  orden: 0,
  activo: true,
  destacada: false,
};

function fmtFecha(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  try {
    return new Date(iso).toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function PromocionesPage() {
  const [items, setItems] = useState<Promocion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithSupabaseSession("/api/promociones", { cache: "no-store" });
      const json = await res.json();
      setItems(Array.isArray(json?.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function uploadBanner(file: File, id: string): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    form.append("entidad", "promociones");
    form.append("id", id);
    const res = await fetchWithSupabaseSession("/api/media/upload", { method: "POST", body: form });
    const json = await res.json();
    return res.ok && json?.success ? (json.data?.url ?? null) : null;
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const method = editing.id ? "PATCH" : "POST";
      const url = editing.id ? `/api/promociones/${editing.id}` : "/api/promociones";
      const payload = {
        titulo: editing.titulo,
        descripcion: editing.descripcion || null,
        banner_url: editing.banner_url || null,
        badge: editing.badge || null,
        valida_hasta: editing.valida_hasta || null,
        cta_label: editing.cta_label || "Quiero esta promoción",
        cta_url: editing.cta_url || null,
        orden: editing.orden,
        activo: editing.activo,
        destacada: editing.destacada,
      };
      const res = await fetchWithSupabaseSession(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo guardar");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta promoción?")) return;
    const res = await fetchWithSupabaseSession(`/api/promociones/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Promociones</h1>
          <p className="mt-1 text-sm text-slate-500">Banners de "Ofertas exclusivas" en greenlandpy.com</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ ...EMPTY })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#16a34a] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
        >
          <Plus className="h-4 w-4" /> Nueva promoción
        </button>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No hay promociones cargadas todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <article key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="relative h-48 bg-slate-100">
                {p.banner_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.banner_url} alt={p.titulo} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <ImagePlus className="h-10 w-10" />
                  </div>
                )}
                {p.activo ? (
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                    Activa
                  </span>
                ) : (
                  <span className="absolute left-3 top-3 rounded-full bg-slate-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                    Inactiva
                  </span>
                )}
                {p.badge ? (
                  <span className="absolute right-3 top-3 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {p.badge}
                  </span>
                ) : null}
              </div>
              <div className="space-y-3 p-4">
                <h3 className="text-base font-semibold text-slate-900">{p.titulo}</h3>
                {p.descripcion ? <p className="text-sm text-slate-600 line-clamp-3">{p.descripcion}</p> : null}
                <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                  <Calendar className="h-3.5 w-3.5" />
                  <span><span className="font-medium">Válida hasta:</span> {fmtFecha(p.valida_hasta)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {p.destacada ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">Destacada</span> : <span />}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing({
                        ...p,
                        descripcion: p.descripcion ?? "",
                        banner_url: p.banner_url ?? "",
                        badge: p.badge ?? "",
                        valida_hasta: p.valida_hasta ?? "",
                        cta_label: p.cta_label ?? "Quiero esta promoción",
                        cta_url: p.cta_url ?? "",
                      })}
                      className="rounded-md bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{editing.id ? "Editar promoción" : "Nueva promoción"}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Título *" full>
                <input className={inputClass} value={editing.titulo} onChange={(e) => setEditing({ ...editing, titulo: e.target.value })} />
              </Field>
              <Field label="Descripción" full>
                <textarea rows={3} className={inputClass} value={editing.descripcion ?? ""} onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })} />
              </Field>
              <Field label="Badge (ej. 30%, Barrio cerrado)">
                <input className={inputClass} value={editing.badge ?? ""} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} />
              </Field>
              <Field label="Válida hasta">
                <input type="date" className={inputClass} value={editing.valida_hasta ?? ""} onChange={(e) => setEditing({ ...editing, valida_hasta: e.target.value })} />
              </Field>
              <Field label="Texto del botón">
                <input className={inputClass} value={editing.cta_label ?? ""} onChange={(e) => setEditing({ ...editing, cta_label: e.target.value })} />
              </Field>
              <Field label="URL del botón">
                <input className={inputClass} placeholder="https://wa.me/..." value={editing.cta_url ?? ""} onChange={(e) => setEditing({ ...editing, cta_url: e.target.value })} />
              </Field>
              <Field label="Banner" full>
                <div className="flex items-center gap-3">
                  <div className="h-20 w-32 overflow-hidden rounded-md bg-slate-100">
                    {editing.banner_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={editing.banner_url} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <ImagePlus className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!editing.id) {
                          setError("Guardá la promoción primero, después subí el banner.");
                          return;
                        }
                        const url = await uploadBanner(file, editing.id);
                        if (url) setEditing({ ...editing, banner_url: url });
                      }}
                    />
                    Subir banner
                  </label>
                  {editing.banner_url ? (
                    <button type="button" onClick={() => setEditing({ ...editing, banner_url: "" })} className="text-xs text-red-600">Quitar</button>
                  ) : null}
                </div>
              </Field>
              <Field label="Orden">
                <input type="number" className={inputClass} value={editing.orden} onChange={(e) => setEditing({ ...editing, orden: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="">
                <div className="flex items-center gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editing.activo} onChange={(e) => setEditing({ ...editing, activo: e.target.checked })} />
                    Activa
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editing.destacada} onChange={(e) => setEditing({ ...editing, destacada: e.target.checked })} />
                    Destacada
                  </label>
                </div>
              </Field>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                Cancelar
              </button>
              <button type="button" onClick={save} disabled={saving} className="rounded-md bg-[#16a34a] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#15803d] disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      {label ? <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label> : null}
      {children}
    </div>
  );
}
