import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { usuarioActual } from "@/lib/sesion";
import { DIR_COMPROBANTES } from "@/lib/db";
import { guardarComprobante, recarga } from "@/lib/yape/recargas";
import { ErrorUsuario } from "@/lib/errores";

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 8 * 1024 * 1024;

// Sube la captura del Yape. Va por route handler y no por server action porque
// las acciones limitan el cuerpo a 1 MB y una foto del celular pesa más.
export async function POST(req: Request, ctx: RouteContext<"/api/recargas/[id]/comprobante">) {
  const usuario = await usuarioActual();
  if (!usuario) return Response.json({ error: "Entra de nuevo a tu cuenta." }, { status: 401 });
  const { id } = await ctx.params;

  const form = await req.formData();
  const archivo = form.get("captura");
  if (!(archivo instanceof File)) return Response.json({ error: "Elige la captura de tu Yape." }, { status: 400 });
  const ext = TIPOS[archivo.type];
  if (!ext) return Response.json({ error: "La captura debe ser JPG, PNG o WebP." }, { status: 400 });
  if (archivo.size > MAX) return Response.json({ error: "La captura pesa más de 8 MB." }, { status: 400 });

  if (recarga(Number(id))?.usuario_id !== usuario.id) {
    return Response.json({ error: "Esa recarga no es tuya." }, { status: 403 });
  }
  const nombre = `${id}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(DIR_COMPROBANTES, nombre), Buffer.from(await archivo.arrayBuffer()));
  try {
    guardarComprobante(Number(id), usuario.id, nombre);
  } catch (e) {
    if (e instanceof ErrorUsuario) return Response.json({ error: e.message }, { status: 403 });
    throw e;
  }
  return Response.json({ ok: true });
}

// Solo la ve su dueño o un admin.
export async function GET(_req: Request, ctx: RouteContext<"/api/recargas/[id]/comprobante">) {
  const usuario = await usuarioActual();
  const { id } = await ctx.params;
  const r = recarga(Number(id));
  if (!usuario || !r?.comprobante || (r.usuario_id !== usuario.id && !usuario.es_admin)) {
    return new Response("no encontrado", { status: 404 });
  }
  const datos = await fs.readFile(path.join(DIR_COMPROBANTES, path.basename(r.comprobante)));
  const ext = path.extname(r.comprobante).slice(1);
  const tipo = Object.entries(TIPOS).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return new Response(datos, { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=3600" } });
}
