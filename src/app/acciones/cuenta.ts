"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { actualizarPerfil, cerrarSesion, entrar, exigirUsuario, registrar } from "@/lib/sesion";
import { aEstado, type Estado } from "@/lib/errores";

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function accionRegistro(_: Estado, fd: FormData): Promise<Estado> {
  try {
    await registrar({
      usuario: txt(fd, "usuario"),
      nombre: txt(fd, "nombre"),
      nombreYape: txt(fd, "nombre_yape"),
      nickDota: txt(fd, "nick_dota"),
      pass: txt(fd, "pass"),
    });
  } catch (e) {
    return aEstado(e);
  }
  redirect("/");
}

export async function accionEntrar(_: Estado, fd: FormData): Promise<Estado> {
  try {
    await entrar(txt(fd, "usuario"), txt(fd, "pass"));
  } catch (e) {
    return aEstado(e);
  }
  redirect("/");
}

export async function accionSalir() {
  await cerrarSesion();
  redirect("/entrar");
}

export async function accionPerfil(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    actualizarPerfil(u.id, {
      nombre: txt(fd, "nombre"),
      nombreYape: txt(fd, "nombre_yape"),
      nickDota: txt(fd, "nick_dota"),
    });
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Perfil guardado." };
}
