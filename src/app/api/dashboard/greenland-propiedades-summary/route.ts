import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

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
  promociones: {
    activas: number;
    vencidas_30d: number;
    vencen_7d: number;
    vencen_30d: number;
    sin_vencimiento: number;
  };
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    const { data: propsRaw, error: errProps } = await supabase
      .from("propiedades")
      .select("activo, visible_web, destacada")
      .eq("empresa_id", auth.empresa_id);
    if (errProps) return NextResponse.json(errorResponse(errProps.message), { status: 400 });

    const props = (propsRaw ?? []) as Array<{ activo: boolean; visible_web: boolean; destacada: boolean }>;
    const total = props.length;
    const activas = props.filter((p) => p.activo).length;
    const publicadas = props.filter((p) => p.activo && p.visible_web).length;
    const destacadas = props.filter((p) => p.destacada).length;
    const tasa_publicacion_pct = total > 0 ? Math.round((publicadas / total) * 100) : 0;
    const pct_destacadas = total > 0 ? Math.round((destacadas / total) * 100) : 0;
    const pct_activas = total > 0 ? Math.round((activas / total) * 100) : 0;

    const { data: promosRaw, error: errPromos } = await supabase
      .from("promociones")
      .select("activo, valida_hasta")
      .eq("empresa_id", auth.empresa_id);
    if (errPromos) return NextResponse.json(errorResponse(errPromos.message), { status: 400 });

    const hoy = new Date();
    const hoyISO = hoy.toISOString().slice(0, 10);
    const en7 = new Date(hoy.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const en30 = new Date(hoy.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const hace30 = new Date(hoy.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const promos = (promosRaw ?? []) as Array<{ activo: boolean; valida_hasta: string | null }>;
    const promosActivas = promos.filter((p) => p.activo);
    const activasVigentes = promosActivas.filter(
      (p) => !p.valida_hasta || p.valida_hasta >= hoyISO,
    );
    const vencidas30 = promosActivas.filter(
      (p) => p.valida_hasta && p.valida_hasta < hoyISO && p.valida_hasta >= hace30,
    ).length;
    const vencen7 = promosActivas.filter(
      (p) => p.valida_hasta && p.valida_hasta >= hoyISO && p.valida_hasta <= en7,
    ).length;
    const vencen30 = promosActivas.filter(
      (p) => p.valida_hasta && p.valida_hasta >= hoyISO && p.valida_hasta <= en30,
    ).length;
    const sinVencimiento = promosActivas.filter((p) => !p.valida_hasta).length;

    const summary: GreenPropiedadesSummary = {
      propiedades: { total, activas, publicadas, destacadas, tasa_publicacion_pct, pct_destacadas, pct_activas },
      promociones: {
        activas: activasVigentes.length,
        vencidas_30d: vencidas30,
        vencen_7d: vencen7,
        vencen_30d: vencen30,
        sin_vencimiento: sinVencimiento,
      },
    };

    return NextResponse.json(successResponse(summary));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
