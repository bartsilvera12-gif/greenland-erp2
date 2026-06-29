"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, KeyRound, Eye, EyeOff } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import ConfirmModal from "@/components/ui/ConfirmModal";

type PortalUser = {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  last_login_at: string | null;
  created_at: string;
};

type FormState = { id?: string; email: string; nombre: string; rol: string; password: string; activo: boolean };

const EMPTY: FormState = { email: "", nombre: "", rol: "empleado", password: "", activo: true };

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}

export default function PortalUsuariosPage() {
  const [items, setItems] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PortalUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchWithSupabaseSession("/api/portal-usuarios", { cache: "no-store" });
      const j = await r.json();
      setItems(Array.isArray(j?.data) ? j.data : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!editing) setShowPass(false); }, [editing]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const method = editing.id ? "PATCH" : "POST";
      const url = editing.id ? `/api/portal-usuarios/${editing.id}` : "/api/portal-usuarios";
      const payload: Record<string, unknown> = {
        email: editing.email,
        nombre: editing.nombre,
        rol: editing.rol || "empleado",
        activo: editing.activo,
      };
      if (editing.password) payload.password = editing.password;
      else if (!editing.id) {
        setError("La contraseña es obligatoria al crear.");
        setSaving(false);
        return;
      }
      const r = await fetchWithSupabaseSession(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) { setError(j?.error ?? "Error al guardar"); return; }
      setEditing(null);
      await load();
    } finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/portal-usuarios/${toDelete.id}`, { method: "DELETE" });
      if (r.ok) { setToDelete(null); await load(); }
    } finally { setDeleting(false); }
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Portal Web</h1>
          <p className="mt-1 text-sm text-slate-500">Empleados con acceso al portal de greenlandpy.com</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ ...EMPTY })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
        >
          <Plus className="h-4 w-4" /> Nuevo usuario
        </button>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No hay usuarios del portal cargados todavía.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Nombre</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Rol</th>
                <th className="px-3 py-2.5">Activo</th>
                <th className="px-3 py-2.5">Último ingreso</th>
                <th className="px-3 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">{u.nombre}</td>
                  <td className="px-3 py-2 text-slate-700">{u.email}</td>
                  <td className="px-3 py-2 text-slate-700">{u.rol}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${u.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{fmtFecha(u.last_login_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, password: "", activo: u.activo })}
                        className="rounded-md bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, password: "", activo: u.activo })}
                        className="rounded-md bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100"
                        title="Cambiar contraseña"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setToDelete(u)}
                        className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{editing.id ? "Editar usuario" : "Nuevo usuario"}</h2>
            <div className="space-y-3">
              <Field label="Nombre *">
                <input className={inputClass} value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} />
              </Field>
              <Field label="Email *">
                <input type="email" className={inputClass} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="Rol">
                <select className={inputClass} value={editing.rol} onChange={(e) => setEditing({ ...editing, rol: e.target.value })}>
                  <option value="empleado">empleado</option>
                  <option value="supervisor">supervisor</option>
                  <option value="gerente">gerente</option>
                </select>
              </Field>
              <Field label={editing.id ? "Nueva contraseña (dejá vacío para no cambiar)" : "Contraseña *"}>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    className={`${inputClass} pr-9`}
                    placeholder="Mínimo 6 caracteres"
                    value={editing.password}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                    title={showPass ? "Ocultar" : "Mostrar"}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.activo} onChange={(e) => setEditing({ ...editing, activo: e.target.checked })} />
                Activo
              </label>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Cancelar</button>
              <button type="button" onClick={save} disabled={saving} className="rounded-md bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={!!toDelete}
        title="Eliminar usuario del portal"
        message={toDelete ? `¿Eliminar a "${toDelete.nombre}" (${toDelete.email})?` : ""}
        hint="No podrá ingresar más al portal."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-1 focus:ring-[#4FAEB2]";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
