import { notFound } from "next/navigation";
import TestApiPagosClient from "./TestApiPagosClient";

/**
 * Gate server-side: solo accesible si `ENABLE_TEST_API_PAGOS=1` está seteada
 * en el ambiente. En prod la dejamos apagada por default — se activa para
 * pruebas con Bancard y se apaga después.
 *
 * Para encender:  Coolify → Environment Variables → ENABLE_TEST_API_PAGOS=1 → Redeploy
 * Para apagar:    quitar la variable (o setear a otro valor) → Redeploy
 */
export const dynamic = "force-dynamic";

export default function TestApiPagosPage() {
  if (process.env.ENABLE_TEST_API_PAGOS !== "1") {
    notFound();
  }
  return <TestApiPagosClient />;
}
