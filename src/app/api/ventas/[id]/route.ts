import { NextRequest, NextResponse } from "next/server";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ventas/[id] — devuelve la venta con los datos necesarios para
 * prellenar el form de "Nueva venta" en modo edición.
 * Combina payload_snapshot (guardado al crear) con datos derivados de la CxC.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const c = await getClientesSupabaseFromAuthWithRol(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = c.auth.empresa_id;

    const vq = await c.supabase
      .from("ventas")
      .select("id, cliente_id, numero_control, moneda, tipo_venta, total, propiedad_id, payload_snapshot, estado")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();
    if (vq.error) return NextResponse.json(errorResponse(vq.error.message), { status: 500 });
    if (!vq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const v = vq.data as {
      id: string; cliente_id: string | null; numero_control: string; moneda: string;
      tipo_venta: string; total: number | string; propiedad_id: string | null;
      payload_snapshot: Record<string, unknown> | null; estado: string;
    };

    const snap = (v.payload_snapshot ?? {}) as Record<string, unknown>;

    // Cuotas para derivar cantidad, monto, intervalo, fecha primera.
    const cxcQ = await c.supabase
      .from("cuentas_por_cobrar")
      .select("total, fecha_vencimiento, numero_cuota, total_cuotas, estado")
      .eq("empresa_id", empresaId)
      .eq("venta_id", id)
      .order("numero_cuota", { ascending: true, nullsFirst: false });
    if (cxcQ.error) return NextResponse.json(errorResponse(cxcQ.error.message), { status: 500 });
    const cxc = (cxcQ.data ?? []) as Array<{ total: number | string; fecha_vencimiento: string | null; numero_cuota: number | null; total_cuotas: number | null; estado: string }>;

    const cuotasCantidad = (snap.cuotas_cantidad as number) || cxc[0]?.total_cuotas || (v.tipo_venta === "CREDITO" ? cxc.length : null);
    const cuotaMonto = (snap.cuota_monto as number) || (cxc[0]?.total ? Number(cxc[0].total) : null);
    const fechaPrimeraCuota = (snap.fecha_primera_cuota as string) || cxc[0]?.fecha_vencimiento || null;
    let intervaloDias = (snap.intervalo_dias as number) || 30;
    if (!snap.intervalo_dias && cxc.length >= 2 && cxc[0]?.fecha_vencimiento && cxc[1]?.fecha_vencimiento) {
      const a = new Date(String(cxc[0].fecha_vencimiento) + "T00:00:00Z").getTime();
      const b = new Date(String(cxc[1].fecha_vencimiento) + "T00:00:00Z").getTime();
      const d = Math.round((b - a) / 86400000);
      if (d > 0) intervaloDias = d;
    }

    // Cliente para prellenar razón/ruc/documento cuando no hay snapshot.
    let cliRazon = (snap.cliente_razon_social as string) ?? "";
    let cliRuc = (snap.cliente_ruc as string | null) ?? null;
    let cliDoc = (snap.cliente_documento as string | null) ?? null;
    if (v.cliente_id && (!cliRazon || !cliRuc)) {
      const cq = await c.supabase
        .from("clientes")
        .select("empresa, nombre_contacto, ruc, documento")
        .eq("empresa_id", empresaId)
        .eq("id", v.cliente_id)
        .maybeSingle();
      const row = (cq.data ?? null) as { empresa: string | null; nombre_contacto: string | null; ruc: string | null; documento: string | null } | null;
      if (row) {
        cliRazon = cliRazon || (row.empresa ?? row.nombre_contacto ?? "").trim();
        cliRuc = cliRuc ?? row.ruc;
        cliDoc = cliDoc ?? row.documento;
      }
    }

    // ¿Se puede editar? No, si algún cxc de esta venta ya tiene cobros_clientes vigentes.
    let editable = true;
    let motivo_no_editable: string | null = null;
    if (v.estado === "anulada") {
      editable = false; motivo_no_editable = "La venta está anulada.";
    } else {
      const cobQ = await c.supabase
        .from("cobros_clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("venta_id", id)
        .neq("estado", "reversado")
        .limit(1);
      if (cobQ.error) return NextResponse.json(errorResponse(cobQ.error.message), { status: 500 });
      if ((cobQ.data ?? []).length > 0) {
        editable = false;
        motivo_no_editable = "La venta tiene cobros registrados. Anulala si querés cancelarla.";
      }
    }

    return NextResponse.json(successResponse({
      venta: {
        id: v.id,
        numero_control: v.numero_control,
        cliente_id: v.cliente_id,
        cliente_razon_social: cliRazon,
        cliente_ruc: cliRuc,
        cliente_documento: cliDoc,
        moneda: v.moneda === "USD" ? "USD" : "GS",
        tipo_iva: (snap.tipo_iva as string) || "10%",
        servicios: Array.isArray(snap.servicios) ? snap.servicios : null,
        observaciones: (snap.observaciones as string | null) ?? null,
        tipo_venta: v.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO",
        cuotas_cantidad: cuotasCantidad,
        cuota_monto: cuotaMonto,
        fecha_primera_cuota: fechaPrimeraCuota,
        intervalo_dias: intervaloDias,
        propiedad_id: v.propiedad_id,
        total: Number(v.total) || 0,
        estado: v.estado,
      },
      editable,
      motivo_no_editable,
    }));
  } catch (err) {
    console.error("[/api/ventas/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la venta."), { status: 500 });
  }
}
