"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getPropiedades } from "@/lib/propiedades/storage";
import type { Propiedad } from "@/lib/propiedades/types";
import DeletePropiedadButton from "./DeletePropiedadButton";
import ToggleActivoButton from "./ToggleActivoButton";
import ToggleDestacadaButton from "./ToggleDestacadaButton";

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

const TIPOS = ["", "casa", "departamento", "duplex", "terreno", "local", "oficina", "deposito", "otro"];
const ESTADOS = ["", "disponible", "reservada", "alquilada", "vendida", "inactiva"];

export default function PropiedadesPage() {
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  useEffect(() => {
    getPropiedades().then((data) => {
      setPropiedades(data);
      setCargando(false);
    });
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return propiedades.filter((p) => {
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (filtroEstado && p.estado !== filtroEstado) return false;
      if (!q) return true;
      return (
        (p.titulo ?? "").toLowerCase().includes(q) ||
        (p.codigo ?? "").toLowerCase().includes(q) ||
        (p.ciudad ?? "").toLowerCase().includes(q) ||
        (p.barrio ?? "").toLowerCase().includes(q) ||
        (p.direccion ?? "").toLowerCase().includes(q)
      );
    });
  }, [propiedades, busqueda, filtroTipo, filtroEstado]);

  function onChangeLocal(next: Propiedad) {
    setPropiedades((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  function onRemoveLocal(id: string) {
    setPropiedades((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Propiedades</h1>
          <p className="mt-1 text-sm text-slate-500">
            Catálogo inmobiliario
            {propiedades.length > 0 && (
              <span className="ml-2 text-slate-400">
                · {filtradas.length} de {propiedades.length}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/propiedades/nueva"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nueva propiedad
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por título, código, ciudad, barrio..."
          className="min-w-48 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t ? t.charAt(0).toUpperCase() + t.slice(1) : "Todos los tipos"}
            </option>
          ))}
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e ? e.charAt(0).toUpperCase() + e.slice(1) : "Todos los estados"}
            </option>
          ))}
        </select>
      </div>

      {cargando ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Cargando propiedades…
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {propiedades.length === 0
            ? "No hay propiedades cargadas todavía."
            : "Sin resultados para los filtros aplicados."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Título</th>
                <th className="hidden px-3 py-2.5 md:table-cell">Tipo</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Operación</th>
                <th className="px-3 py-2.5">Ciudad</th>
                <th className="hidden px-3 py-2.5 xl:table-cell">Barrio</th>
                <th className="px-3 py-2.5 text-right">Precio</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Estado</th>
                <th className="px-3 py-2.5">Activo</th>
                <th className="px-3 py-2.5">Destacada</th>
                <th className="sticky right-0 bg-slate-50 px-3 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{p.titulo}</div>
                    {p.codigo ? (
                      <div className="mt-0.5 text-[11px] text-slate-400">{p.codigo}</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-1 md:hidden">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{p.tipo}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{p.estado}</span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 capitalize text-slate-700 md:table-cell">{p.tipo}</td>
                  <td className="hidden px-3 py-2 capitalize text-slate-700 lg:table-cell">{p.operacion.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-slate-700">{p.ciudad ?? "—"}</td>
                  <td className="hidden px-3 py-2 text-slate-700 xl:table-cell">{p.barrio ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {fmtPrecio(p.precio, p.moneda)}
                  </td>
                  <td className="hidden px-3 py-2 capitalize text-slate-700 lg:table-cell">{p.estado}</td>
                  <td className="px-3 py-2">
                    <ToggleActivoButton propiedad={p} onChange={onChangeLocal} />
                  </td>
                  <td className="px-3 py-2">
                    <ToggleDestacadaButton propiedad={p} onChange={onChangeLocal} />
                  </td>
                  <td className="sticky right-0 bg-white px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/propiedades/${p.id}`}
                        title="Ver"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#4FAEB2]/10 text-[#3F8E91] ring-1 ring-[#4FAEB2]/30 hover:bg-[#4FAEB2]/20"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </Link>
                      <Link
                        href={`/propiedades/${p.id}/editar`}
                        title="Editar"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </Link>
                      <DeletePropiedadButton propiedad={p} onDeleted={onRemoveLocal} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
