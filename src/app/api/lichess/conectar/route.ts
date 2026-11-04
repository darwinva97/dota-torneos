import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesion";
import { empezarOAuth } from "@/lib/lichess";

// Manda al usuario a Lichess a autorizar. El verificador PKCE y el estado se
// guardan en una cookie corta; nunca viajan en la URL.
export async function GET(req: Request) {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  const base = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  const { url, verificador, estado } = empezarOAuth(`${base}/api/lichess/callback`);
  (await cookies()).set("pozo_lichess", JSON.stringify({ verificador, estado }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/lichess",
    maxAge: 600,
  });
  redirect(url);
}
