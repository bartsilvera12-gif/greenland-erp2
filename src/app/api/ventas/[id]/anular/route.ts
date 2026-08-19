import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/ventas/[id]/anular — soft-delete de una venta.
 * Marca `ventas.estado = 'anulada'` y sus `cuentas_por_cobrar` como `anulado`.
 * NO toca cobros ya registrados: quedan como referencia histórica.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const t = await getTenantSupabaseFromAuth(request);
    if (!t) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = t.auth.empresa_id;

    const vq = await t.supabase
      .from("ventas")
      .select("id, estado")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();
    if (vq.error) return NextResponse.json(errorResponse(vq.error.message), { status: 500 });
    if (!vq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((vq.data as { estado: string }).estado === "anulada") {
      return NextResponse.json(successResponse({ ok: true, ya_anulada: true }));
    }

    const upVenta = await t.supabase
      .from("ventas")
      .update({ estado: "anulada", updated_at: new Date().toISOString() })
      .eq("empresa_id", empresaId)
      .eq("id", id);
    if (upVenta.error) return NextResponse.json(errorResponse(upVenta.error.message), { status: 500 });

    const upCxc = await t.supabase
      .from("cuentas_por_cobrar")
      .update({ estado: "anulado", updated_at: new Date().toISOString() })
      .eq("empresa_id", empresaId)
      .eq("venta_id", id)
      .neq("estado", "pagado");
    if (upCxc.error) return NextResponse.json(errorResponse(upCxc.error.message), { status: 500 });

    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/ventas/[id]/anular POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo anular la venta."), { status: 500 });
  }
}
