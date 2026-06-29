"use client";

/**
 * Página interna de testing para los 3 métodos de la API de cobranzas externa.
 * Simula ser Bancard: usás tu X-Api-Key, elegís una cuota y disparás pago/reversa.
 *
 * NO es para usuarios finales — es para QA/integración. En producción real,
 * Bancard llama estos endpoints desde su sistema cuando un cliente paga en
 * una boca o app de Infonet.
 */

import { useState } from "react";
import { Eye, EyeOff, Search, Send, RotateCcw } from "lucide-react";

const BASE = typeof window !== "undefined" ? window.location.origin : "";

type Cuota = {
  id: string; numero: string; fecha_vencimiento: string | null;
  total: number; pagado: number; saldo: number; estado: string; dias_mora: number;
};
type Consulta = {
  cliente: { nombre: string; documento: string | null; ruc: string | null } | null;
  cuotas: Cuota[];
};

export default function TestApiPagosPage() {
  const [apiKey, setApiKey] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem("test_api_key") ?? "" : ""));
  const [showKey, setShowKey] = useState(false);
  const [ci, setCi] = useState("1111111");
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [txId, setTxId] = useState("");

  function persistKey(k: string) {
    setApiKey(k);
    localStorage.setItem("test_api_key", k);
  }

  function genTx() {
    const t = `TEST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setTxId(t);
    return t;
  }

  async function doConsulta() {
    setLoading(true); setResult(null);
    try {
      const r = await fetch(`${BASE}/api/public/mis-pagos?ci=${encodeURIComponent(ci.trim())}`);
      const j = await r.json();
      if (j?.success && j.data) setConsulta(j.data as Consulta);
      setResult({ ok: r.ok, text: JSON.stringify(j, null, 2) });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "error" });
    } finally { setLoading(false); }
  }

  async function doPago(c: Cuota) {
    if (!apiKey) { alert("Cargá la X-Api-Key arriba primero."); return; }
    const tx = txId || genTx();
    setLoading(true); setResult(null);
    try {
      const r = await fetch(`${BASE}/api/public/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey, "X-Partner-Id": "test-erp" },
        body: JSON.stringify({
          transaccion_id: tx,
          numero_venta: c.numero,
          monto: c.saldo,
          moneda: "GS",
          metodo: "transferencia",
          referencia: "Test desde ERP",
        }),
      });
      const j = await r.json();
      setResult({ ok: r.ok, text: JSON.stringify(j, null, 2) });
      // Refrescar consulta tras pago
      await doConsulta();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "error" });
    } finally { setLoading(false); }
  }

  async function doReversa() {
    if (!apiKey) { alert("Cargá la X-Api-Key arriba primero."); return; }
    if (!txId) { alert("Necesitás un transaccion_id (el que generaste al pagar)."); return; }
    setLoading(true); setResult(null);
    try {
      const r = await fetch(`${BASE}/api/public/pagos/reversa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey, "X-Partner-Id": "test-erp" },
        body: JSON.stringify({ transaccion_id: txId }),
      });
      const j = await r.json();
      setResult({ ok: r.ok, text: JSON.stringify(j, null, 2) });
      await doConsulta();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "error" });
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Test API de Cobranzas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Simulá ser Bancard. Disparás <strong>consulta → pago → reversa</strong> manualmente y ves la respuesta cruda.
          Es la misma API que va a usar Bancard en producción.
        </p>
      </header>

      {/* API key */}
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-800">X-Api-Key</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => persistKey(e.target.value)}
              placeholder="Pegá la EXTERNAL_PAYMENT_API_KEY de Coolify"
              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 pr-10 text-sm font-mono outline-none focus:border-amber-500"
            />
            <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-700">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-amber-700">Se guarda en localStorage de este browser. No se manda a ningún lado salvo en los headers de pago/reversa.</p>
      </section>

      {/* Consulta */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">1. Consulta de deudas</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-600">CI del cliente</label>
            <input
              value={ci}
              onChange={(e) => setCi(e.target.value)}
              placeholder="Ej: 1111111"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            type="button"
            onClick={doConsulta}
            disabled={loading || !ci}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" /> Consultar
          </button>
        </div>

        {consulta?.cliente ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm">
              Cliente: <strong>{consulta.cliente.nombre}</strong>
              {consulta.cliente.documento ? ` · CI ${consulta.cliente.documento}` : ""}
            </p>
            {consulta.cuotas.length === 0 ? (
              <p className="text-sm text-slate-500">Sin cuotas registradas.</p>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr><th className="py-1.5">N° venta</th><th>Vence</th><th>Total</th><th>Saldo</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consulta.cuotas.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 font-mono text-xs">{c.numero}</td>
                      <td>{c.fecha_vencimiento ?? "—"}</td>
                      <td>Gs. {c.total.toLocaleString("es-PY")}</td>
                      <td>Gs. {c.saldo.toLocaleString("es-PY")}</td>
                      <td>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          c.estado === "pagado" ? "bg-emerald-50 text-emerald-700"
                          : c.estado === "vencido" ? "bg-rose-50 text-rose-700"
                          : c.estado === "parcial" ? "bg-sky-50 text-sky-700"
                          : "bg-amber-50 text-amber-700"
                        }`}>{c.estado}</span>
                      </td>
                      <td>
                        {c.saldo > 0 && (
                          <button
                            type="button"
                            onClick={() => { genTx(); doPago(c); }}
                            disabled={loading || !apiKey}
                            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            title={apiKey ? "Aplicar pago por el saldo completo" : "Cargá la API key primero"}
                          >
                            <Send className="h-3 w-3" /> Pagar Gs. {c.saldo.toLocaleString("es-PY")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : consulta && !consulta.cliente ? (
          <p className="mt-3 text-sm text-slate-500">Sin resultados para ese documento.</p>
        ) : null}
      </section>

      {/* Reversa */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">3. Reversa</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[280px]">
            <label className="mb-1 block text-xs text-slate-600">Transaccion ID a reversar</label>
            <input
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="Se llena solo cuando hacés un pago"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            type="button"
            onClick={doReversa}
            disabled={loading || !apiKey || !txId}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reversar
          </button>
        </div>
      </section>

      {/* Resultado */}
      {result && (
        <section className={`rounded-xl border p-4 ${result.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Respuesta del server</h2>
          <pre className="overflow-auto rounded bg-white/60 p-3 text-xs font-mono leading-relaxed">{result.text}</pre>
        </section>
      )}
    </div>
  );
}
