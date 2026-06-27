"use client";

import { useEffect, useState } from "react";
import { Building, Star, Megaphone, Calendar } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

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
  promociones: {
    activas: number;
    vencidas_30d: number;
    vencen_7d: number;
    vencen_30d: number;
    sin_vencimiento: number;
  };
};

const PANEL = "rounded-2xl border border-[#4FAEB2]/45 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8";
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

  const { propiedades, promociones } = data;

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

      {/* Promociones — reemplaza la sección "Suscripciones a planes" del original */}
      <section className={PANEL}>
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full" style={{ backgroundColor: TEAL }} />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TEAL }} />
            Promociones
          </p>
        </div>
        <p className="mb-5 text-xs text-slate-500">Estado y vencimientos de las ofertas exclusivas mostradas en greenlandpy.com.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <PromoStat label="Activas vigentes" value={promociones.activas} icon={<Megaphone className="h-4 w-4" />} tone="ok" />
          <PromoStat label="Vencen en 7 días" value={promociones.vencen_7d} icon={<Calendar className="h-4 w-4" />} tone="warn" />
          <PromoStat label="Vencen en 30 días" value={promociones.vencen_30d} icon={<Calendar className="h-4 w-4" />} tone="info" />
          <PromoStat label="Sin vencimiento" value={promociones.sin_vencimiento} icon={<Calendar className="h-4 w-4" />} tone="muted" />
          <PromoStat label="Vencidas (30d)" value={promociones.vencidas_30d} icon={<Calendar className="h-4 w-4" />} tone="danger" />
        </div>
      </section>
    </div>
  );
}

type PromoTone = "ok" | "warn" | "info" | "muted" | "danger";

function PromoStat({
  label, value, icon, tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: PromoTone;
}) {
  const toneBg: Record<PromoTone, string> = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    warn: "bg-amber-50 text-amber-700 ring-amber-100",
    info: "bg-sky-50 text-sky-700 ring-sky-100",
    muted: "bg-slate-50 text-slate-600 ring-slate-100",
    danger: "bg-rose-50 text-rose-700 ring-rose-100",
  };
  return (
    <div className={`rounded-xl p-3 ring-1 ${toneBg[tone]}`}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
