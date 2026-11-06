"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { exigirUsuario } from "@/lib/sesion";
import { aEstado, exigir, type Estado } from "@/lib/errores";
import { leerSoles } from "@/lib/dinero";
import * as M from "@/lib/mercados";
import { torneo } from "@/lib/torneos";

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
      modalidad: fd.get("modalidad") === "pozo" ? "pozo" : "parche",
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

// Igualar devolviendo lo que sobra también lo puede hacer quien organiza el
// torneo, porque sin parchar no puede empezar la partida.
async function puedeIgualar(u: { id: number; es_admin: number }, m: M.Mercado) {
  return puedeGestionar(u, m) || (!!m.torneo_id && torneo(m.torneo_id)?.organizador_id === u.id);
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

// Bloquear lo pueden quien creó la apuesta, quien organiza su torneo o un admin.
export async function accionBloquear(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  let quedo: "cerrado" | "anulado";
  try {
    const m = M.mercado(num(fd, "mercado_id"));
    exigir(m, "Esa apuesta no existe.");
    exigir(await puedeIgualar(u, m), "Solo quien creó la apuesta puede bloquearla.");
    quedo = M.bloquearMercado(m.id);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return quedo === "anulado"
    ? { ok: "Nadie apostó al otro bando: se anuló y se devolvió todo." }
    : { ok: "Apuestas bloqueadas: ya nadie puede entrar ni retirarse." };
}

export async function accionResolver(_: Estado, fd: FormData) {
  return gestionar(fd, (m) => M.resolverMercado(m.id, num(fd, "opcion_id")), "Apuesta resuelta y pagada.");
}

// Una vez bloqueada, anular o declarar empate solo lo puede un admin: así
// nadie la anula al ver que su bando va perdiendo.
function exigirAdminSiBloqueada(m: M.Mercado, esAdmin: number) {
  exigir(m.estado === "abierto" || esAdmin, "La apuesta ya está bloqueada: solo un admin puede anularla o declarar empate.");
}

export async function accionAnular(_: Estado, fd: FormData) {
  const u = await exigirUsuario();
  return gestionar(
    fd,
    (m) => {
      exigirAdminSiBloqueada(m, u.es_admin);
      M.anularMercado(m.id);
    },
    "Apuesta anulada. Se devolvió todo.",
  );
}

export async function accionRetirarApuesta(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    M.retirarApuesta(u.id, num(fd, "mercado_id"));
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Retiraste tu apuesta. Volvió a tu saldo." };
}

export async function accionDevolverNoParchado(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    const m = M.mercado(num(fd, "mercado_id"));
    exigir(m, "Esa apuesta no existe.");
    exigir(await puedeIgualar(u, m), "Solo quien gestiona la apuesta puede igualarla.");
    M.devolverNoParchado(m.id);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Se devolvió lo que sobraba. La apuesta quedó parchada." };
}

export async function accionEmpatar(_: Estado, fd: FormData) {
  const u = await exigirUsuario();
  return gestionar(
    fd,
    (m) => {
      exigirAdminSiBloqueada(m, u.es_admin);
      M.empatar(m.id);
    },
    "Empate: se devolvió lo apostado a todos.",
  );
}
