import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import { signPropiedadImagen } from "@/lib/propiedades/imagen-storage";

export type GreenPropiedadCard = {
  id: string;
  titulo: string;
  tipo: string | null;
  ciudad: string | null;
  precio: number | null;
  moneda: string | null;
  imagen_url: string | null;
};

export type GreenPropiedadesSummary = {
  propiedades: {
    total: number;
    activas: number;
    publicadas: number;
    destacadas: number;
    tasa_publicacion_pct: number;
    pct_destacadas: number;
    pct_activas: number;
  };
  ultimas: GreenPropiedadCard[];
  por_ciudad: Array<{ ciudad: string; n: number }>;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    // 1) Conteos
    const { data: propsRaw, error: errProps } = await supabase
      .from("propiedades")
      .select("activo, visible_web, destacada, ciudad")
      .eq("empresa_id", auth.empresa_id);
    if (errProps) {
      console.error("[greenland-propiedades-summary] propiedades:", errProps.message);
    }
    const props = (propsRaw ?? []) as Array<{ activo: boolean; visible_web: boolean | null; destacada: boolean; ciudad: string | null }>;
    const total = props.length;
    const activas = props.filter((p) => p.activo).length;
    const publicadas = props.filter((p) => p.activo && p.visible_web !== false).length;
    const destacadas = props.filter((p) => p.destacada).length;
    const tasa_publicacion_pct = total > 0 ? Math.round((publicadas / total) * 100) : 0;
    const pct_destacadas = total > 0 ? Math.round((destacadas / total) * 100) : 0;
    const pct_activas = total > 0 ? Math.round((activas / total) * 100) : 0;

    // 2) Propiedades por ciudad (top 12)
    const porCiudadMap = new Map<string, number>();
    for (const p of props) {
      const c = (p.ciudad ?? "").trim() || "Sin ciudad";
      porCiudadMap.set(c, (porCiudadMap.get(c) ?? 0) + 1);
    }
    const por_ciudad = Array.from(porCiudadMap.entries())
      .map(([ciudad, n]) => ({ ciudad, n }))
      .sort((a, b) => b.n - a.n || a.ciudad.localeCompare(b.ciudad))
      .slice(0, 12);

    // 3) Últimas 6 propiedades cargadas (con foto si tienen)
    const { data: ultRaw, error: errUlt } = await supabase
      .from("propiedades")
      .select("id, titulo, tipo, ciudad, precio, moneda, imagen_path")
      .eq("empresa_id", auth.empresa_id)
      .order("created_at", { ascending: false })
      .limit(6);
    if (errUlt) {
      console.error("[greenland-propiedades-summary] ultimas:", errUlt.message);
    }
    const ultRows = (ultRaw ?? []) as Array<{
      id: string; titulo: string; tipo: string | null; ciudad: string | null;
      precio: number | string | null; moneda: string | null; imagen_path: string | null;
    }>;
    const ultimas: GreenPropiedadCard[] = await Promise.all(
      ultRows.map(async (r) => ({
        id: r.id,
        titulo: r.titulo,
        tipo: r.tipo,
        ciudad: r.ciudad,
        precio: r.precio == null ? null : Number(r.precio) || 0,
        moneda: r.moneda,
        imagen_url: r.imagen_path ? await signPropiedadImagen(supabase, r.imagen_path, 3600) : null,
      })),
    );

    const summary: GreenPropiedadesSummary = {
      propiedades: { total, activas, publicadas, destacadas, tasa_publicacion_pct, pct_destacadas, pct_activas },
      ultimas,
      por_ciudad,
    };

    return NextResponse.json(successResponse(summary));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
