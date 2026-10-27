import crypto from "node:crypto";
import { normalizar } from "@/lib/yape/proveedor";
import { ingresarPago } from "@/lib/yape/recargas";
import { ErrorUsuario } from "@/lib/errores";

// Punto de entrada para el observador de Yape (la app del celular). Acepta un
// pago o una lista de pagos:
//
//   POST /api/yape/notificacion
//   Authorization: Bearer <YAPE_WEBHOOK_SECRET>
//   { "id": "abc123", "monto": "20.00", "nombre": "Juan C. Perez", "recibido": "2026-10-27T15:04:05-05:00" }

function autorizado(req: Request) {
  const secreto = process.env.YAPE_WEBHOOK_SECRET;
  if (!secreto) return false;
  const dado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(dado);
  const b = Buffer.from(secreto);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return Response.json({ error: "no autorizado" }, { status: 401 });
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  const resultados = [];
  for (const c of lista) {
    const p = normalizar(c as Record<string, unknown>, "webhook");
    if (!p) {
      resultados.push({ ok: false, error: "faltan id, monto o nombre" });
      continue;
    }
    try {
      resultados.push({ ok: true, ...ingresarPago(p) });
    } catch (e) {
      if (!(e instanceof ErrorUsuario)) throw e;
      resultados.push({ ok: false, error: e.message });
    }
  }
  return Response.json({ resultados });
}
