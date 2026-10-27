import crypto from "node:crypto";
import { pagoDesdeYapi, type CuerpoYapi } from "@/lib/yape/yapi";
import { ingresarPago } from "@/lib/yape/recargas";

// Integración de yapi. Sus webhooks no van firmados, así que aceptamos dos formas
// de identificarse:
//  - La cabecera X-Yapi-Integration-Id: el id aleatorio que yapi asigna a la
//    integración del canal. Los permitidos van en YAPI_INTEGRACIONES (separados
//    por comas). Así la URL que se escribe en el celular no lleva secretos:
//      https://apuestas.bezenti.com/api/yape/yapi
//  - O ?token=<YAPE_WEBHOOK_SECRET> en la URL.

function igual(dado: string, esperado: string) {
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function autorizado(req: Request) {
  const integracion = req.headers.get("x-yapi-integration-id") ?? "";
  const permitidas = (process.env.YAPI_INTEGRACIONES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (integracion && permitidas.some((p) => igual(integracion, p))) return true;
  const secreto = process.env.YAPE_WEBHOOK_SECRET;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return !!secreto && !!token && igual(token, secreto);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return Response.json({ error: "no autorizado" }, { status: 401 });
  const cuerpo = (await req.json().catch(() => null)) as CuerpoYapi | null;
  if (!cuerpo) return Response.json({ error: "JSON inválido" }, { status: 400 });

  // Al canal le pueden llegar otras notificaciones de Yape (publicidad, avisos de
  // envío propio…). Las que no son un pago recibido se ignoran con 200.
  const pago = pagoDesdeYapi(cuerpo);
  if (!pago) return Response.json({ ok: true, ignorado: "no es un pago recibido" });
  return Response.json({ ok: true, ...ingresarPago(pago) });
}
