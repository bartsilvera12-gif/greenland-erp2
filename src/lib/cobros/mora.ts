/** Recargo fijo por día de mora sobre cuotas de venta a crédito (Gs). */
export const RECARGO_POR_DIA_MORA = 5000;

/** Días vencidos entre `fecha_vencimiento` y `referencia` (ambos ISO YYYY-MM-DD). Nunca negativo. */
export function calcularDiasMora(fechaVencimiento: string | null | undefined, referencia?: string): number {
  if (!fechaVencimiento) return 0;
  const venc = String(fechaVencimiento).slice(0, 10);
  const ref = (referencia ? String(referencia) : new Date().toISOString()).slice(0, 10);
  const v = new Date(venc + "T00:00:00Z").getTime();
  const r = new Date(ref + "T00:00:00Z").getTime();
  if (!Number.isFinite(v) || !Number.isFinite(r)) return 0;
  const diff = Math.floor((r - v) / 86400000);
  return diff > 0 ? diff : 0;
}

/** Recargo total (Gs) por mora dada la fecha de vencimiento y la fecha del pago. */
export function calcularRecargoMora(fechaVencimiento: string | null | undefined, referencia?: string): number {
  return calcularDiasMora(fechaVencimiento, referencia) * RECARGO_POR_DIA_MORA;
}
