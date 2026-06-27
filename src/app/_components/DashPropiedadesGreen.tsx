"use client";

import { useEffect, useState } from "react";
import { Building, Star } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Card = {
  id: string;
  titulo: string;
  tipo: string | null;
  ciudad: string | null;
  precio: number | null;
  moneda: string | null;
  imagen_url: string | null;
};

type Summary = {
  propiedades: {
    total: number;
    activas: number;
    publicadas: number;
    destacadas: number;
    tasa_publicacion_pct: number;
    pct_destacadas: number;
    pct_activas: number;
  };
  ultimas: Card[];
  por_ciudad: Array<{ ciudad: string; n: number }>;
};

const PANEL =
  "rounded-2xl border border-[#4FAEB2]/45 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8";
const TEAL = "#4FAEB2";

type KpiTone = "ok" | "info" | "warn" | "muted";

function KpiCard({
  label, value, icon, stats,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  stats: Array<{ label: string; value: number | string; tone?: KpiTone }>;
}) {
  const toneClass: Record<KpiTone, string> = {
    ok: "bg-emerald-50 text-emerald-700",
    info: "bg-sky-50 text-sky-700",
    warn: "bg-amber-50 text-amber-700",
    muted: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="rounded-2xl border border-[#4FAEB2]/30 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4FAEB2]/12 text-[#3F8E91]">
          {icon}
        </span>
      </div>
      <p className="text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {stats.map((s) => (
          <span
            key={s.label}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${toneClass[s.tone ?? "muted"]}`}
          >
            {s.value} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtPrecio(precio: number | null, moneda: string | null): string {
  if (precio == null) return "—";
  const m = moneda || "PYG";
  try {
    return new Intl.NumberFormat("es-PY", { style: "currency", currency: m, maximumFractionDigits: 0 }).format(precio);
  } catch {
    return `${m} ${precio.toLocaleString("es-PY")}`;
  }
}

export default function DashPropiedadesGreen() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetchWithSupabaseSession("/api/dashboard/greenland-propiedades-summary", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { success?: boolean; data?: Summary; error?: string };
        if (cancelled) return;
        if (body.success && body.data) setData(body.data);
        else throw new Error(body.error ?? "Respuesta inválida");
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: TEAL }} />
        <span className="ml-3">Cargando catálogo inmobiliario…</span>
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-sm text-rose-800">
        No se pudo cargar el resumen: {err ?? "sin datos"}
      </div>
    );
  }

  const { propiedades, ultimas, por_ciudad } = data;
  const maxCiudad = por_ciudad[0]?.n ?? 1;

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard
          label="Propiedades"
          value={propiedades.total}
          icon={<Building className="h-4 w-4" />}
          stats={[
            { label: "activas", value: propiedades.activas, tone: "ok" },
            { label: "publicadas", value: propiedades.publicadas, tone: "info" },
            { label: "destacadas", value: propiedades.destacadas, tone: "warn" },
          ]}
        />
        <KpiCard
          label="Tasa publicación"
          value={`${propiedades.tasa_publicacion_pct}%`}
          icon={<Star className="h-4 w-4" />}
          stats={[
            { label: "% destacadas", value: `${propiedades.pct_destacadas}%`, tone: "warn" },
            { label: "% activas", value: `${propiedades.pct_activas}%`, tone: "ok" },
          ]}
        />
      </div>

      {/* Últimas propiedades cargadas */}
      <section className={PANEL}>
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full" style={{ backgroundColor: TEAL }} />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TEAL }} />
            Últimas propiedades cargadas
          </p>
        </div>
        {ultimas.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Sin propiedades cargadas todavía.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ultimas.map((p) => (
              <article key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex h-44 items-center justify-center bg-slate-50">
                  {p.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagen_url} alt={p.titulo} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-slate-400">sin foto</span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate font-semibold text-slate-900">{p.titulo}</p>
                  <p className="text-xs text-slate-500">
                    {[p.tipo, p.ciudad].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="pt-1 text-sm font-bold tabular-nums text-[#3F8E91]">{fmtPrecio(p.precio, p.moneda)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Propiedades por ciudad */}
      <section className={PANEL}>
        <div className="mb-1 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full" style={{ backgroundColor: TEAL }} />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TEAL }} />
            Propiedades por ciudad
          </p>
        </div>
        <p className="mb-5 text-xs text-slate-500">Top 12 ciudades con más propiedades</p>
        {por_ciudad.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Sin datos.</p>
        ) : (
          <ul className="space-y-2.5">
            {por_ciudad.map((c) => {
              const pct = Math.max(6, Math.round((c.n / maxCiudad) * 100));
              return (
                <li key={c.ciudad} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-slate-700">{c.ciudad}</span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: TEAL, opacity: 0.85 }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700">{c.n}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
