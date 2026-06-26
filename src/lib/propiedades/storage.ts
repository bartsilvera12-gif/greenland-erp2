import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type {
  Propiedad,
  NuevaPropiedadInput,
  ActualizarPropiedadInput,
} from "./types";

interface SupabaseRow {
  id: string;
  empresa_id: string;
  codigo: string | null;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  operacion: string;
  estado: string;
  ciudad: string | null;
  barrio: string | null;
  direccion: string | null;
  lat: number | string | null;
  lng: number | string | null;
  precio: number | string | null;
  moneda: string;
  dormitorios: number | null;
  banos: number | null;
  cocheras: number | null;
  superficie_m2: number | string | null;
  terreno_m2: number | string | null;
  destacada: boolean;
  visible_web: boolean;
  activo: boolean;
  imagen_path?: string | null;
  imagen_url?: string | null;
  modalidad?: string | null;
  cuotas_cantidad?: number | null;
  cuota_monto?: number | string | null;
  servicios?: unknown;
  medidas?: unknown;
  finca?: string | null;
  padron?: string | null;
  cuenta_catastral?: string | null;
  created_at: string;
  updated_at: string;
}

function toNum(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToPropiedad(row: SupabaseRow): Propiedad {
  return {
    id: row.id,
    empresa_id: row.empresa_id,
    codigo: row.codigo,
    titulo: row.titulo,
    descripcion: row.descripcion,
    tipo: row.tipo,
    operacion: row.operacion,
    estado: row.estado,
    ciudad: row.ciudad,
    barrio: row.barrio,
    direccion: row.direccion,
    lat: toNum(row.lat),
    lng: toNum(row.lng),
    precio: toNum(row.precio),
    moneda: row.moneda,
    dormitorios: row.dormitorios,
    banos: row.banos,
    cocheras: row.cocheras,
    superficie_m2: toNum(row.superficie_m2),
    terreno_m2: toNum(row.terreno_m2),
    destacada: row.destacada === true,
    visible_web: row.visible_web !== false,
    activo: row.activo !== false,
    imagen_path: row.imagen_path ?? null,
    imagen_url: row.imagen_url ?? null,
    modalidad: row.modalidad ?? null,
    cuotas_cantidad: row.cuotas_cantidad ?? null,
    cuota_monto: toNum(row.cuota_monto ?? null),
    servicios: Array.isArray(row.servicios) ? (row.servicios as string[]) : [],
    medidas: (row.medidas && typeof row.medidas === "object")
      ? (row.medidas as Record<string, { m?: number; linda?: string }>)
      : {},
    finca: row.finca ?? null,
    padron: row.padron ?? null,
    cuenta_catastral: row.cuenta_catastral ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getPropiedades(): Promise<Propiedad[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetchWithSupabaseSession("/api/propiedades", { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { success: boolean; data?: unknown };
    if (!json.success || !Array.isArray(json.data)) return [];
    return (json.data as SupabaseRow[]).map(rowToPropiedad);
  } catch (e) {
    console.error("[propiedades] getPropiedades:", e);
    return [];
  }
}

export async function getPropiedad(id: string): Promise<Propiedad | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetchWithSupabaseSession(`/api/propiedades/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success: boolean; data?: unknown };
    if (!json.success || !json.data) return null;
    return rowToPropiedad(json.data as SupabaseRow);
  } catch (e) {
    console.error("[propiedades] getPropiedad:", e);
    return null;
  }
}

export async function savePropiedad(datos: NuevaPropiedadInput): Promise<Propiedad> {
  const res = await fetchWithSupabaseSession("/api/propiedades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const json = (await res.json()) as { success?: boolean; data?: unknown; error?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json?.error ?? `Error ${res.status}`);
  }
  return rowToPropiedad(json.data as SupabaseRow);
}

export async function updatePropiedad(
  id: string,
  datos: ActualizarPropiedadInput,
): Promise<Propiedad> {
  const res = await fetchWithSupabaseSession(`/api/propiedades/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const json = (await res.json()) as { success?: boolean; data?: unknown; error?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json?.error ?? `Error ${res.status}`);
  }
  return rowToPropiedad(json.data as SupabaseRow);
}

export async function deletePropiedad(id: string): Promise<void> {
  const res = await fetchWithSupabaseSession(`/api/propiedades/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json?.error ?? `Error ${res.status}`);
  }
}

export async function toggleActivo(id: string, activo: boolean): Promise<Propiedad> {
  return updatePropiedad(id, { activo });
}

export async function toggleDestacada(id: string, destacada: boolean): Promise<Propiedad> {
  return updatePropiedad(id, { destacada });
}
