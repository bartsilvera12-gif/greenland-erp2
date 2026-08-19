import { NextRequest, NextResponse } from "next/server";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { crearVentaServicio, VentaServicioError, type CrearVentaServicioBody } from "@/lib/ventas/server/crear-venta-servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ventas/[id]/reemplazar — edita una venta borrándola y recreándola.
 * Bloquea si ya tiene cobros aplicados. NO se envuelve en una transacción real
 * (Supabase JS no lo permite): se hace best-effort en orden seguro (validar → borrar cxc → borrar venta → recrear).
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const c = await getClientesSupabaseFromAuthWithRol(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = c.auth.empresa_id;

    const vq = await c.supabase
      .from("ventas")
      .select("id, estado, numero_control")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();
    if (vq.error) return NextResponse.json(errorResponse(vq.error.message), { status: 500 });
    if (!vq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const vRow = vq.data as { estado: string; numero_control: string };
    if (vRow.estado === "anulada") {
      return NextResponse.json(errorResponse("La venta está anulada; no puede editarse."), { status: 409 });
    }
    const numeroControlOriginal = vRow.numero_control;

    // Bloquear si hay cobros vigentes.
    const cobQ = await c.supabase
      .from("cobros_clientes")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("venta_id", id)
      .neq("estado", "reversado")
      .limit(1);
    if (cobQ.error) return NextResponse.json(errorResponse(cobQ.error.message), { status: 500 });
    if ((cobQ.data ?? []).length > 0) {
      return NextResponse.json(errorResponse("La venta tiene cobros registrados. Anulala en vez de editar."), { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as CrearVentaServicioBody;

    // Borrar CxC de esta venta y luego la venta.
    const delCxc = await c.supabase
      .from("cuentas_por_cobrar")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("venta_id", id);
    if (delCxc.error) return NextResponse.json(errorResponse(`No se pudieron borrar las cuotas: ${delCxc.error.message}`), { status: 500 });

    const delV = await c.supabase
      .from("ventas")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("id", id);
    if (delV.error) return NextResponse.json(errorResponse(`No se pudo borrar la venta original: ${delV.error.message}`), { status: 500 });

    // Recrear la venta con los datos nuevos, conservando el numero_control original.
    const r = await crearVentaServicio(c.supabase, empresaId, body, { numeroControlOverride: numeroControlOriginal });
    return NextResponse.json(successResponse({
      venta: { id: r.venta_id, numero_control: r.numero_control, total: r.total, tipo_venta: r.tipo_venta },
      cliente_id: r.cliente_id,
      reemplazo_de: id,
    }));
  } catch (err) {
    if (err instanceof VentaServicioError) {
      return NextResponse.json(errorResponse(err.message), { status: err.status });
    }
    console.error("[/api/ventas/[id]/reemplazar POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo reemplazar la venta."), { status: 500 });
  }
}
