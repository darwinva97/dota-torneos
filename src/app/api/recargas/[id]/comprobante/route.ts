import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { usuarioActual } from "@/lib/sesion";
import { DIR_COMPROBANTES } from "@/lib/db";
import { guardarComprobante, recarga } from "@/lib/yape/recargas";
import { ErrorUsuario } from "@/lib/errores";

const TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
};
const MAX = 15 * 1024 * 1024;

// Algunos navegadores de celular mandan la foto sin tipo; lo deducimos de la extensión.
function extension(archivo: File) {
  if (TIPOS[archivo.type]) return TIPOS[archivo.type];
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpeg") return "jpg";
  return Object.values(TIPOS).includes(ext) ? ext : null;
}

// Sube la captura del Yape. Va por route handler y no por server action porque
// las acciones limitan el cuerpo a 1 MB y una foto del celular pesa más.
export async function POST(req: Request, ctx: RouteContext<"/api/recargas/[id]/comprobante">) {
  const usuario = await usuarioActual();
  if (!usuario) return Response.json({ error: "Entra de nuevo a tu cuenta." }, { status: 401 });
  const { id } = await ctx.params;

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("captura");
  const rechazo = (status: number, error: string) => {
    // Se registra para poder diagnosticar luego por qué alguien no pudo subirla.
    console.warn(`[comprobante] recarga ${id} de ${usuario.usuario}: ${error}`, archivo instanceof File ? { tipo: archivo.type, nombre: archivo.name, bytes: archivo.size } : {});
    return Response.json({ error }, { status });
  };
  if (!(archivo instanceof File)) return rechazo(400, "Elige la captura de tu Yape.");
  const ext = extension(archivo);
  if (!ext) return rechazo(400, "La captura debe ser una imagen (JPG, PNG, WebP o HEIC).");
  if (archivo.size > MAX) return rechazo(400, "La captura pesa más de 15 MB.");

  if (recarga(Number(id))?.usuario_id !== usuario.id) return rechazo(403, "Esa recarga no es tuya.");
  const nombre = `${id}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(DIR_COMPROBANTES, nombre), Buffer.from(await archivo.arrayBuffer()));
  try {
    guardarComprobante(Number(id), usuario.id, nombre);
  } catch (e) {
    if (e instanceof ErrorUsuario) return rechazo(403, e.message);
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
