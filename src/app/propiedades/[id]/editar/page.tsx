"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, use } from "react";
import { getPropiedad, updatePropiedad } from "@/lib/propiedades/storage";
import PropiedadForm, { type PropiedadFormValues } from "../../PropiedadForm";

export default function EditPropiedadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [initial, setInitial] = useState<PropiedadFormValues | null>(null);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPropiedad(id).then((p) => {
      if (!p) {
        setNotFound(true);
        return;
      }
      const m = (p.medidas ?? {}) as Record<string, { m?: number | null; linda?: string | null; calle?: string | null } | undefined>;
      const medDir = (k: "norte" | "sur" | "este" | "oeste") => ({
        m: m[k]?.m ?? null,
        linda: m[k]?.linda ?? "",
        calle: m[k]?.calle ?? "",
      });
      setInitial({
        codigo: p.codigo ?? "",
        titulo: p.titulo,
        descripcion: p.descripcion ?? "",
        tipo: String(p.tipo),
        operacion: String(p.operacion),
        estado: String(p.estado),
        ciudad: p.ciudad ?? "",
        barrio: p.barrio ?? "",
        direccion: p.direccion ?? "",
        lat: p.lat,
        lng: p.lng,
        precio: p.precio,
        moneda: String(p.moneda),
        dormitorios: p.dormitorios,
        banos: p.banos,
        cocheras: p.cocheras,
        superficie_m2: p.superficie_m2,
        terreno_m2: p.terreno_m2,
        destacada: p.destacada,
        visible_web: p.visible_web,
        activo: p.activo,
        modalidad: p.modalidad ?? "",
        cuotas_cantidad: p.cuotas_cantidad ?? null,
        cuota_monto: p.cuota_monto ?? null,
        servicios: Array.isArray(p.servicios) ? p.servicios : [],
        medidas: { norte: medDir("norte"), sur: medDir("sur"), este: medDir("este"), oeste: medDir("oeste") },
        finca: p.finca ?? "",
        padron: p.padron ?? "",
        cuenta_catastral: p.cuenta_catastral ?? "",
      });
      setInitialImageUrl(p.imagen_url ?? null);
    });
  }, [id]);

  async function handleSubmit(values: PropiedadFormValues) {
    setSaving(true);
    setError(null);
    try {
      await updatePropiedad(id, {
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
        modalidad: values.modalidad || null,
        cuotas_cantidad: values.cuotas_cantidad,
        cuota_monto: values.cuota_monto,
        servicios: values.servicios,
        medidas: values.medidas,
        finca: values.finca || null,
        padron: values.padron || null,
        cuenta_catastral: values.cuenta_catastral || null,
      });
      router.push(`/propiedades/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-4 px-6 py-12 text-center">
        <p className="text-sm text-slate-600">Propiedad no encontrada.</p>
        <Link href="/propiedades" className="text-sm text-[#3F8E91] hover:underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  if (!initial) {
    return <div className="px-6 py-12 text-center text-sm text-slate-500">Cargando…</div>;
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header>
        <Link href={`/propiedades/${id}`} className="text-xs text-slate-500 hover:text-slate-800">
          ← Volver al detalle
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Editar propiedad</h1>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <PropiedadForm
        initial={initial}
        submitting={saving}
        onSubmit={handleSubmit}
        submitLabel="Guardar cambios"
        propiedadId={id}
        initialImageUrl={initialImageUrl}
      />
    </div>
  );
}
