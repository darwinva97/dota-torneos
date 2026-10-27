import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import crypto from "node:crypto";
import { db } from "./db";
import { ErrorUsuario, exigir } from "./errores";

const COOKIE = "pozo_sesion";
const DURACION_MS = 30 * 24 * 3600 * 1000;

export type Usuario = {
  id: number;
  usuario: string;
  nombre: string;
  nombre_yape: string;
  nick_dota: string;
  es_admin: number;
  saldo: number;
};

// --- Contraseñas: scrypt de node, sin dependencias nativas extra ---

function hashear(pass: string) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(pass, sal, 64);
  return `${sal.toString("hex")}:${h.toString("hex")}`;
}

function verificar(pass: string, guardado: string) {
  const [sal, h] = guardado.split(":");
  const calc = crypto.scryptSync(pass, Buffer.from(sal, "hex"), 64);
  return crypto.timingSafeEqual(calc, Buffer.from(h, "hex"));
}

// --- Sesiones: token aleatorio en la cookie, su hash en la base ---

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

async function abrirSesion(usuarioId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expira = Date.now() + DURACION_MS;
  db()
    .prepare("INSERT INTO sesiones (token_hash, usuario_id, expira) VALUES (?, ?, ?)")
    .run(sha(token), usuarioId, expira);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expira),
  });
}

export async function cerrarSesion() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sesiones WHERE token_hash = ?").run(sha(token));
  jar.delete(COOKIE);
}

export function usuarioPorId(id: number) {
  return db()
    .prepare(
      "SELECT id, usuario, nombre, nombre_yape, nick_dota, es_admin, saldo FROM usuarios WHERE id = ?",
    )
    .get(id) as Usuario | undefined;
}

// Usuario actual o null. cache() lo memoriza durante una misma petición.
// connection() lo saca de cualquier prerender: saldos y caducidades se leen
// siempre en el momento, nunca de una copia prefetcheada.
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  await connection();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const fila = db()
    .prepare("SELECT usuario_id, expira FROM sesiones WHERE token_hash = ?")
    .get(sha(token)) as { usuario_id: number; expira: number } | undefined;
  if (!fila || fila.expira < Date.now()) return null;
  return usuarioPorId(fila.usuario_id) ?? null;
});

export async function exigirUsuario() {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  return u;
}

export async function exigirAdmin() {
  const u = await exigirUsuario();
  if (!u.es_admin) redirect("/");
  return u;
}

// --- Registro y entrada ---

export async function registrar(datos: {
  usuario: string;
  nombre: string;
  nombreYape: string;
  nickDota: string;
  pass: string;
}) {
  const usuario = datos.usuario.trim();
  exigir(/^[a-zA-Z0-9_.-]{3,20}$/.test(usuario), "El usuario debe tener de 3 a 20 letras, números, punto o guion.");
  exigir(datos.nombre.trim().length >= 2, "Escribe tu nombre.");
  exigir(
    datos.nombreYape.trim().split(/\s+/).length >= 2,
    "Escribe tu nombre y apellido tal como salen en Yape. Con eso reconocemos tus recargas.",
  );
  exigir(datos.pass.length >= 8, "La contraseña debe tener al menos 8 caracteres.");

  const conn = db();
  const existe = conn.prepare("SELECT 1 FROM usuarios WHERE usuario = ?").get(usuario);
  if (existe) throw new ErrorUsuario("Ese usuario ya existe. Elige otro.");

  // El primero en registrarse administra el pozo.
  const esPrimero = !conn.prepare("SELECT 1 FROM usuarios LIMIT 1").get();
  const r = conn
    .prepare(
      `INSERT INTO usuarios (usuario, nombre, nombre_yape, nick_dota, pass_hash, es_admin)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      usuario,
      datos.nombre.trim(),
      datos.nombreYape.trim(),
      datos.nickDota.trim(),
      hashear(datos.pass),
      esPrimero ? 1 : 0,
    );
  await abrirSesion(Number(r.lastInsertRowid));
}

export async function entrar(usuario: string, pass: string) {
  const fila = db()
    .prepare("SELECT id, pass_hash FROM usuarios WHERE usuario = ?")
    .get(usuario.trim()) as { id: number; pass_hash: string } | undefined;
  if (!fila || !verificar(pass, fila.pass_hash)) {
    throw new ErrorUsuario("Usuario o contraseña incorrectos.");
  }
  await abrirSesion(fila.id);
}

export function actualizarPerfil(id: number, d: { nombre: string; nombreYape: string; nickDota: string }) {
  exigir(d.nombre.trim().length >= 2, "Escribe tu nombre.");
  exigir(d.nombreYape.trim().split(/\s+/).length >= 2, "Escribe tu nombre y apellido tal como salen en Yape.");
  db()
    .prepare("UPDATE usuarios SET nombre = ?, nombre_yape = ?, nick_dota = ? WHERE id = ?")
    .run(d.nombre.trim(), d.nombreYape.trim(), d.nickDota.trim(), id);
}
