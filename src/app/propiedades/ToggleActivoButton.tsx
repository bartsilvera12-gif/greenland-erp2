"use client";

import { useState } from "react";
import { toggleActivo } from "@/lib/propiedades/storage";
import type { Propiedad } from "@/lib/propiedades/types";

export default function ToggleActivoButton({
  propiedad,
  onChange,
}: {
  propiedad: Propiedad;
  onChange: (p: Propiedad) => void;
}) {
  const [pending, setPending] = useState(false);
  const activo = propiedad.activo;

  async function handleClick() {
    setPending(true);
    try {
      const updated = await toggleActivo(propiedad.id, !activo);
      onChange(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      title={activo ? "Desactivar" : "Activar"}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
        activo
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      } ${pending ? "opacity-50" : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-emerald-500" : "bg-slate-400"}`} />
      {activo ? "Activo" : "Inactivo"}
    </button>
  );
}
