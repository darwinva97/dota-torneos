import "server-only";
import { ingresarPago, type PagoEntrante } from "./recargas";

// Adaptador hacia la API del observador de Yape (la app del celular que lee
// las notificaciones). Hay dos formas de que lleguen los pagos y sirven las dos:
//
//  a) Empuje: el observador hace POST a /api/yape/notificacion con
//     `Authorization: Bearer $YAPE_WEBHOOK_SECRET`. Ver ese route handler.
//  b) Consulta: si existe YAPE_API_URL, este módulo la consulta cada
//     YAPE_API_INTERVALO_MS (3 s por defecto) pidiendo los pagos nuevos.
//
// PENDIENTE: el formato real de la API todavía no lo tenemos. `normalizar`
// asume un JSON razonable; cuando llegue la documentación solo hay que
// ajustar esa función (y quizá la URL de consulta).

type Crudo = Record<string, unknown>;

export function normalizar(c: Crudo, fuente: string): PagoEntrante | null {
  const id = c.id ?? c.externalId ?? c.transactionId ?? c.idNotificacion;
  const nombre = c.nombre ?? c.name ?? c.sender ?? c.senderName ?? c.remitente;
  const montoBruto = c.monto ?? c.amount ?? c.importe;
  const fecha = c.recibido ?? c.receivedAt ?? c.fecha ?? c.date ?? c.timestamp;
  if (id == null || nombre == null || montoBruto == null) return null;

  // Montos en soles («20.50» o 20.5). Si la API ya manda céntimos, que mande
  // `montoCentimos` y lo respetamos tal cual.
  const monto =
    typeof c.montoCentimos === "number"
      ? Math.round(c.montoCentimos)
      : Math.round(Number(String(montoBruto).replace(",", ".").replace(/[^\d.]/g, "")) * 100);
  const recibido =
    typeof fecha === "number" ? (fecha < 1e12 ? fecha * 1000 : fecha) : fecha ? Date.parse(String(fecha)) : Date.now();

  if (!Number.isFinite(monto) || monto <= 0) return null;
  return {
    externoId: String(id),
    nombre: String(nombre),
    monto,
    recibido: Number.isFinite(recibido) ? recibido : Date.now(),
    fuente,
    crudo: c,
  };
}

let ultimaConsulta = Date.now() - 15 * 60 * 1000;

async function consultar() {
  const url = new URL(process.env.YAPE_API_URL!);
  url.searchParams.set("desde", new Date(ultimaConsulta - 60_000).toISOString());
  const res = await fetch(url, {
    headers: process.env.YAPE_API_TOKEN ? { Authorization: `Bearer ${process.env.YAPE_API_TOKEN}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`API de Yape respondió ${res.status}`);
  const cuerpo = (await res.json()) as unknown;
  const lista = Array.isArray(cuerpo) ? cuerpo : ((cuerpo as Crudo).pagos ?? (cuerpo as Crudo).data ?? []);
  ultimaConsulta = Date.now();
  // ingresarPago descarta duplicados por id externo, así que solapar ventanas es seguro.
  for (const c of lista as Crudo[]) {
    const p = normalizar(c, "api");
    if (p) ingresarPago(p);
  }
}

const g = globalThis as unknown as { __pozoSondeo?: NodeJS.Timeout };

export function arrancarSondeo() {
  if (!process.env.YAPE_API_URL || g.__pozoSondeo) return;
  const cada = Number(process.env.YAPE_API_INTERVALO_MS ?? 3000);
  let ocupado = false;
  g.__pozoSondeo = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await consultar();
    } catch (e) {
      console.error("[yape] consulta fallida:", (e as Error).message);
    } finally {
      ocupado = false;
    }
  }, cada);
  console.log(`[yape] consultando ${process.env.YAPE_API_URL} cada ${cada} ms`);
}
