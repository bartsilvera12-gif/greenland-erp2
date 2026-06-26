"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Star, ImagePlus } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Testimonio = {
  id: string;
  autor: string;
  rol: string | null;
  ciudad: string | null;
  contenido: string;
  foto_url: string | null;
  calificacion: number;
  orden: number;
  activo: boolean;
  destacado: boolean;
};

type FormState = Omit<Testimonio, "id"> & { id?: string };

const EMPTY: FormState = {
  autor: "",
  rol: "",
  ciudad: "",
  contenido: "",
  foto_url: "",
  calificacion: 5,
  orden: 0,
  activo: true,
  destacado: false,
};

export default function TestimoniosPage() {
  const [items, setItems] = useState<Testimonio[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithSupabaseSession("/api/testimonios", { cache: "no-store" });
      const json = await res.json();
      setItems(Array.isArray(json?.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function uploadFoto(file: File, id: string): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    form.append("entidad", "testimonios");
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
      const url = editing.id ? `/api/testimonios/${editing.id}` : "/api/testimonios";
      const payload = {
        autor: editing.autor,
        rol: editing.rol || null,
        ciudad: editing.ciudad || null,
        contenido: editing.contenido,
        foto_url: editing.foto_url || null,
        calificacion: editing.calificacion,
        orden: editing.orden,
        activo: editing.activo,
        destacado: editing.destacado,
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
    if (!confirm("¿Eliminar este testimonio?")) return;
    const res = await fetchWithSupabaseSession(`/api/testimonios/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Testimonios</h1>
          <p className="mt-1 text-sm text-slate-500">Reseñas que se muestran en greenlandpy.com</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ ...EMPTY })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
        >
          <Plus className="h-4 w-4" /> Nuevo testimonio
        </button>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No hay testimonios cargados todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <article key={t.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-100">
                  {t.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.foto_url} alt={t.autor} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-400">
                      {t.autor.trim()[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{t.autor}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[t.rol, t.ciudad].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-0.5 flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${i < t.calificacion ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm text-slate-700 line-clamp-4">{t.contenido}</p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <div className="flex gap-2">
                  <span className={`rounded px-1.5 py-0.5 ${t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.activo ? "Activo" : "Inactivo"}
                  </span>
                  {t.destacado && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Destacado</span>}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ ...t, rol: t.rol ?? "", ciudad: t.ciudad ?? "", foto_url: t.foto_url ?? "" })}
                    className="rounded-md bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{editing.id ? "Editar testimonio" : "Nuevo testimonio"}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Autor *">
                <input className={inputClass} value={editing.autor} onChange={(e) => setEditing({ ...editing, autor: e.target.value })} />
              </Field>
              <Field label="Rol">
                <input className={inputClass} value={editing.rol ?? ""} placeholder="Propietario, Inversor…" onChange={(e) => setEditing({ ...editing, rol: e.target.value })} />
              </Field>
              <Field label="Ciudad">
                <input className={inputClass} value={editing.ciudad ?? ""} onChange={(e) => setEditing({ ...editing, ciudad: e.target.value })} />
              </Field>
              <Field label="Calificación (1-5)">
                <input type="number" min={1} max={5} className={inputClass} value={editing.calificacion} onChange={(e) => setEditing({ ...editing, calificacion: Math.min(5, Math.max(1, Number(e.target.value) || 5)) })} />
              </Field>
              <Field label="Contenido *" full>
                <textarea rows={4} className={inputClass} value={editing.contenido} onChange={(e) => setEditing({ ...editing, contenido: e.target.value })} />
              </Field>
              <Field label="Foto" full>
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-100">
                    {editing.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={editing.foto_url} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <ImagePlus className="h-5 w-5" />
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
                          setError("Guardá el testimonio primero, después subí la foto.");
                          return;
                        }
                        const url = await uploadFoto(file, editing.id);
                        if (url) setEditing({ ...editing, foto_url: url });
                      }}
                    />
                    Subir foto
                  </label>
                  {editing.foto_url ? (
                    <button type="button" onClick={() => setEditing({ ...editing, foto_url: "" })} className="text-xs text-red-600">Quitar</button>
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
                    Activo
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editing.destacado} onChange={(e) => setEditing({ ...editing, destacado: e.target.checked })} />
                    Destacado
                  </label>
                </div>
              </Field>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                Cancelar
              </button>
              <button type="button" onClick={save} disabled={saving} className="rounded-md bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-1 focus:ring-[#4FAEB2]";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      {label ? <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label> : null}
      {children}
    </div>
  );
}
