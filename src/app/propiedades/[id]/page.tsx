"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { getPropiedad } from "@/lib/propiedades/storage";
import type { Propiedad } from "@/lib/propiedades/types";

function fmtPrecio(precio: number | null, moneda: string | null): string {
  if (precio == null) return "—";
  const m = moneda || "PYG";
  try {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: m,
      maximumFractionDigits: 0,
    }).format(precio);
  } catch {
    return `${m} ${precio.toLocaleString("es-PY")}`;
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value ?? "—"}</span>
    </div>
  );
}

export default function PropiedadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [propiedad, setPropiedad] = useState<Propiedad | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPropiedad(id).then((p) => {
      setPropiedad(p);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">Cargando propiedad…</div>
    );
  }

  if (!propiedad) {
    return (
      <div className="space-y-4 px-6 py-12 text-center">
        <p className="text-sm text-slate-600">Propiedad no encontrada.</p>
        <Link href="/propiedades" className="text-sm text-[#3F8E91] hover:underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/propiedades" className="text-xs text-slate-500 hover:text-slate-800">
            ← Volver al listado
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {propiedad.titulo}
          </h1>
          {propiedad.codigo && (
            <p className="mt-1 text-sm text-slate-500">Código: {propiedad.codigo}</p>
          )}
        </div>
        <Link
          href={`/propiedades/${propiedad.id}/editar`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
        >
          Editar
        </Link>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Datos generales</h2>
          <Row label="Tipo" value={<span className="capitalize">{propiedad.tipo}</span>} />
          <Row label="Operación" value={<span className="capitalize">{propiedad.operacion.replace("_", " ")}</span>} />
          <Row label="Estado" value={<span className="capitalize">{propiedad.estado}</span>} />
          <Row label="Precio" value={fmtPrecio(propiedad.precio, propiedad.moneda)} />
          <Row label="Activo" value={propiedad.activo ? "Sí" : "No"} />
          <Row label="Destacada" value={propiedad.destacada ? "Sí" : "No"} />
          <Row label="Visible en web" value={propiedad.visible_web ? "Sí" : "No"} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Ubicación</h2>
          <Row label="Ciudad" value={propiedad.ciudad} />
          <Row label="Barrio" value={propiedad.barrio} />
          <Row label="Dirección" value={propiedad.direccion} />
          <Row label="Latitud" value={propiedad.lat} />
          <Row label="Longitud" value={propiedad.lng} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Características</h2>
          <Row label="Dormitorios" value={propiedad.dormitorios} />
          <Row label="Baños" value={propiedad.banos} />
          <Row label="Cocheras" value={propiedad.cocheras} />
          <Row label="Superficie" value={propiedad.superficie_m2 != null ? `${propiedad.superficie_m2} m²` : "—"} />
          <Row label="Terreno" value={propiedad.terreno_m2 != null ? `${propiedad.terreno_m2} m²` : "—"} />
        </section>

        {propiedad.descripcion && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Descripción</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{propiedad.descripcion}</p>
          </section>
        )}
      </div>
    </div>
  );
}
