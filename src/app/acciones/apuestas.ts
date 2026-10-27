"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { exigirUsuario } from "@/lib/sesion";
import { aEstado, exigir, type Estado } from "@/lib/errores";
import { leerSoles } from "@/lib/dinero";
import * as M from "@/lib/mercados";

const num = (fd: FormData, k: string) => Number(fd.get(k));

export async function accionCrearApuesta(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  let id: number;
  try {
    id = M.crearMercado({
      creadorId: u.id,
      titulo: String(fd.get("titulo") ?? ""),
      descripcion: String(fd.get("descripcion") ?? ""),
      opciones: fd.getAll("opcion").map((o) => ({ etiqueta: String(o) })),
    });
  } catch (e) {
    return aEstado(e);
  }
  redirect(`/apuestas/${id}`);
}

export async function accionApostar(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    const monto = leerSoles(fd.get("monto"));
    exigir(monto, "Escribe cuánto apuestas, por ejemplo 10 o 7.50.");
    M.apostar(u.id, num(fd, "mercado_id"), num(fd, "opcion_id"), monto);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Apuesta registrada." };
}

// Las apuestas libres las resuelve quien las creó (o un admin). Las de torneo
// se resuelven solas con el resultado; aquí solo un admin puede forzarlas.
function puedeGestionar(u: { id: number; es_admin: number }, m: M.Mercado) {
  return u.es_admin || (m.creador_id === u.id && !m.torneo_id);
}

async function gestionar(fd: FormData, fn: (m: M.Mercado) => void, ok: string): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    const m = M.mercado(num(fd, "mercado_id"));
    exigir(m, "Esa apuesta no existe.");
    exigir(puedeGestionar(u, m), "Solo quien creó la apuesta puede hacer esto.");
    fn(m);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok };
}

export async function accionCerrarApuesta(_: Estado, fd: FormData) {
  return gestionar(fd, (m) => M.cerrarMercado(m.id), "Apuesta cerrada: ya nadie puede entrar.");
}

export async function accionResolver(_: Estado, fd: FormData) {
  return gestionar(fd, (m) => M.resolverMercado(m.id, num(fd, "opcion_id")), "Apuesta resuelta y pagada.");
}

export async function accionAnular(_: Estado, fd: FormData) {
  return gestionar(fd, (m) => M.anularMercado(m.id), "Apuesta anulada. Se devolvió todo.");
}
