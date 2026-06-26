"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { savePropiedad } from "@/lib/propiedades/storage";
import PropiedadForm, { type PropiedadFormValues, EMPTY_FORM } from "../PropiedadForm";

export default function NuevaPropiedadPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: PropiedadFormValues) {
    setSaving(true);
    setError(null);
    try {
      const propiedad = await savePropiedad({
        codigo: values.codigo || null,
        titulo: values.titulo.trim(),
        descripcion: values.descripcion || null,
        tipo: values.tipo,
        operacion: values.operacion,
        estado: values.estado,
        ciudad: values.ciudad || null,
        barrio: values.barrio || null,
        direccion: values.direccion || null,
        lat: values.lat,
        lng: values.lng,
        precio: values.precio,
        moneda: values.moneda,
        dormitorios: values.dormitorios,
        banos: values.banos,
        cocheras: values.cocheras,
        superficie_m2: values.superficie_m2,
        terreno_m2: values.terreno_m2,
        destacada: values.destacada,
        visible_web: values.visible_web,
        activo: values.activo,
      });
      router.push(`/propiedades/${propiedad.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header>
        <Link href="/propiedades" className="text-xs text-slate-500 hover:text-slate-800">
          ← Volver al listado
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Nueva propiedad</h1>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <PropiedadForm
        initial={EMPTY_FORM}
        submitting={saving}
        onSubmit={handleSubmit}
        submitLabel="Crear propiedad"
      />
    </div>
  );
}
