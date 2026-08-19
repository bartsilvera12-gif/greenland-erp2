import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import { crearVentaServicio, VentaServicioError, type CrearVentaServicioBody } from "@/lib/ventas/server/crear-venta-servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as CrearVentaServicioBody;
    const r = await crearVentaServicio(ctx.supabase, ctx.auth.empresa_id, body);
    return NextResponse.json(successResponse({
      venta: { id: r.venta_id, numero_control: r.numero_control, total: r.total, tipo_venta: r.tipo_venta },
      cliente_id: r.cliente_id,
    }));
  } catch (err) {
    if (err instanceof VentaServicioError) {
      return NextResponse.json(errorResponse(err.message), { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[/api/ventas/servicio POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
