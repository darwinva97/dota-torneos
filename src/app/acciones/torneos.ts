"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { exigirUsuario } from "@/lib/sesion";
import { aEstado, type Estado } from "@/lib/errores";
import { leerSoles } from "@/lib/dinero";
import * as T from "@/lib/torneos";
import { crearMercado, mercadosDeTorneo } from "@/lib/mercados";

const num = (fd: FormData, k: string) => Number(fd.get(k));
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function accionCrearTorneo(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  let id: number;
  try {
    id = T.crearTorneo({
      organizadorId: u.id,
      nombre: txt(fd, "nombre"),
      descripcion: txt(fd, "descripcion"),
      entrada: leerSoles(fd.get("entrada")),
      garantia: fd.get("con_garantia") ? leerSoles(fd.get("garantia")) : 0,
      limiteLlegada: txt(fd, "limite_llegada"),
      tamEquipo: num(fd, "tam_equipo"),
      maxEquipos: num(fd, "max_equipos"),
      reparto: txt(fd, "reparto"),
      fecha: txt(fd, "fecha"),
    });
  } catch (e) {
    return aEstado(e);
  }
  redirect(`/torneos/${id}`);
}

// Las acciones de un torneo comparten forma: hacer algo y refrescar la página.
async function ejecutar(fn: (u: Awaited<ReturnType<typeof exigirUsuario>>) => void, ok: string): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    fn(u);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok };
}

export async function accionCrearEquipo(_: Estado, fd: FormData) {
  return ejecutar((u) => T.crearEquipo(num(fd, "torneo_id"), u.id, txt(fd, "nombre")), "Equipo creado. Ya estás dentro.");
}

export async function accionUnirse(_: Estado, fd: FormData) {
  return ejecutar((u) => T.unirseEquipo(num(fd, "equipo_id"), u.id), "Te uniste al equipo.");
}

export async function accionSalirTorneo(_: Estado, fd: FormData) {
  return ejecutar((u) => T.salirDeTorneo(num(fd, "torneo_id"), u.id), "Saliste del torneo. Te devolvimos la entrada.");
}

export async function accionIniciar(_: Estado, fd: FormData) {
  return ejecutar((u) => T.iniciarTorneo(num(fd, "torneo_id"), u.id, !!u.es_admin), "Cuadro sorteado. ¡A jugar!");
}

export async function accionCancelarTorneo(_: Estado, fd: FormData) {
  return ejecutar(
    (u) => T.cancelarTorneo(num(fd, "torneo_id"), u.id, !!u.es_admin),
    "Torneo cancelado. Se devolvieron todas las entradas y apuestas.",
  );
}

export async function accionAsistencia(_: Estado, fd: FormData) {
  const valor = txt(fd, "asistencia");
  return ejecutar(
    (u) =>
      T.marcarAsistencia(
        num(fd, "torneo_id"),
        num(fd, "jugador_id"),
        valor === "a_tiempo" || valor === "falto" ? valor : null,
        u.id,
        !!u.es_admin,
      ),
    "Asistencia guardada.",
  );
}

export async function accionEnJuego(_: Estado, fd: FormData) {
  return ejecutar(
    (u) => T.marcarEnJuego(num(fd, "partida_id"), u.id, !!u.es_admin),
    "Partida en juego. Las apuestas de esta partida se cerraron.",
  );
}

export async function accionGanador(_: Estado, fd: FormData) {
  return ejecutar(
    (u) => T.reportarGanador(num(fd, "partida_id"), num(fd, "equipo_id"), u.id, !!u.es_admin),
    "Resultado guardado.",
  );
}

// Abre una apuesta sobre una partida del cuadro, o sobre el campeón si no se
// indica partida. Las opciones son los equipos, y se resuelve sola.
export async function accionApostarEnTorneo(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const torneoId = num(fd, "torneo_id");
  const partidaId = fd.get("partida_id") ? num(fd, "partida_id") : undefined;
  let id: number;
  try {
    const t = T.torneo(torneoId);
    if (!t || t.estado !== "en_curso") return { error: "Solo se abren apuestas con el torneo en curso." };
    const equipos = T.equiposDe(torneoId);
    let opciones = equipos;
    let titulo = `¿Quién gana ${t.nombre}?`;
    if (partidaId) {
      const pt = T.partidasDe(torneoId).find((p) => p.id === partidaId);
      if (!pt || pt.estado !== "pendiente" || !pt.equipo_a || !pt.equipo_b) {
        return { error: "Esa partida ya no admite apuestas." };
      }
      opciones = equipos.filter((e) => e.id === pt.equipo_a || e.id === pt.equipo_b);
      titulo = `${opciones[0].nombre} contra ${opciones[1].nombre} (${t.nombre})`;
    }
    const existente = mercadosDeTorneo(torneoId).find((m) => (m.partida_id ?? undefined) === partidaId && (m.estado === "abierto" || m.estado === "cerrado"));
    id =
      existente?.id ??
      crearMercado({
        creadorId: u.id,
        titulo,
        torneoId,
        partidaId,
        opciones: opciones.map((e) => ({ etiqueta: e.nombre, equipoId: e.id })),
      });
  } catch (e) {
    return aEstado(e);
  }
  redirect(`/apuestas/${id}`);
}
