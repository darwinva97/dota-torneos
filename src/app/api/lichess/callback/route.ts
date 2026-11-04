import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesion";
import { terminarOAuth } from "@/lib/lichess";
import { ErrorUsuario } from "@/lib/errores";

// Lichess vuelve aquí con el código de autorización.
export async function GET(req: Request) {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  const url = new URL(req.url);
  const jar = await cookies();
  const guardado = jar.get("pozo_lichess")?.value;
  jar.delete({ name: "pozo_lichess", path: "/api/lichess" });
  const volver = (msg: string) => redirect(`/perfil?lichess=${encodeURIComponent(msg)}`);

  if (url.searchParams.get("error")) volver("Cancelaste la conexión con Lichess.");
  const { verificador, estado } = guardado ? (JSON.parse(guardado) as { verificador: string; estado: string }) : {};
  if (!verificador || url.searchParams.get("state") !== estado) volver("La conexión con Lichess caducó. Vuelve a intentarlo.");

  let mensaje: string;
  try {
    const base = process.env.PUBLIC_URL ?? url.origin;
    const nombre = await terminarOAuth(u.id, url.searchParams.get("code") ?? "", verificador!, `${base}/api/lichess/callback`);
    mensaje = `ok:${nombre}`;
  } catch (e) {
    if (!(e instanceof ErrorUsuario)) console.error("[lichess] oauth:", e);
    mensaje = e instanceof ErrorUsuario ? e.message : "No se pudo conectar con Lichess.";
  }
  volver(mensaje);
}
