import "server-only";
import { db, transaccion } from "./db";
import { ErrorUsuario, exigir } from "./errores";
import { soles } from "./dinero";
import { avisar } from "./avisos";
import { anularMercado, crearMercado, jugadasDe, mercado, opcionesDe } from "./mercados";
import { equiposDe, torneo, type Partida } from "./torneos";

// Alineaciones por partida. Si en un enfrentamiento juega alguien distinto de
// los inscritos (un cambio o un suplente), quien organiza lo registra aquí. Las
// apuestas se hicieron pensando en otros jugadores, así que:
//  1. la apuesta de esa partida se anula y se devuelve todo a cada uno;
//  2. se abre al momento una apuesta nueva igual, vacía, con la alineación nueva;
//  3. a cada persona que había apostado le llega un aviso con el enlace, para
//     que decida si vuelve a apostar.
// El premio del torneo no cambia: sigue siendo de los integrantes del equipo.

export type Jugador = { usuario_id: number; usuario: string; suplente: boolean };

function partida(id: number) {
  return db().prepare("SELECT * FROM partidas WHERE id = ?").get(id) as Partida | undefined;
}

// Quién juega por un equipo en una partida: la alineación registrada o, si no
// hay, los integrantes del equipo.
export function alineacion(partidaId: number, equipoId: number): Jugador[] {
  const filas = db()
    .prepare(
      `SELECT a.usuario_id, u.usuario,
         NOT EXISTS (SELECT 1 FROM integrantes i WHERE i.equipo_id = a.equipo_id AND i.usuario_id = a.usuario_id) AS suplente
       FROM alineaciones a JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.partida_id = ? AND a.equipo_id = ? ORDER BY u.usuario COLLATE NOCASE`,
    )
    .all(partidaId, equipoId) as { usuario_id: number; usuario: string; suplente: number }[];
  if (filas.length) return filas.map((f) => ({ ...f, suplente: !!f.suplente }));
  return db()
    .prepare(
      `SELECT i.usuario_id, u.usuario FROM integrantes i JOIN usuarios u ON u.id = i.usuario_id
       WHERE i.equipo_id = ? ORDER BY u.usuario COLLATE NOCASE`,
    )
    .all(equipoId)
    .map((f) => ({ ...(f as { usuario_id: number; usuario: string }), suplente: false }));
}

export function alineacionCambiada(partidaId: number) {
  return !!db().prepare("SELECT 1 FROM alineaciones WHERE partida_id = ? LIMIT 1").get(partidaId);
}

// Partidas de un torneo en las que cambió quién juega (para marcarlas).
export function partidasConCambio(torneoId: number) {
  return new Set(
    (
      db()
        .prepare("SELECT DISTINCT a.partida_id FROM alineaciones a JOIN partidas p ON p.id = a.partida_id WHERE p.torneo_id = ?")
        .all(torneoId) as { partida_id: number }[]
    ).map((f) => f.partida_id),
  );
}

export type ResultadoCambio = {
  entran: string[];
  salen: string[];
  devuelto: number;
  apostadores: number;
  nuevaApuesta: number | null;
  /** Texto listo para pegar en el grupo de WhatsApp. */
  mensaje: string;
};

export function cambiarAlineacion(d: {
  partidaId: number;
  equipoId: number;
  /** Ids de los integrantes del equipo que juegan. */
  integrantes: number[];
  /** Usuarios de la página que entran como suplentes («@ana, beto»). */
  suplentes: string;
  usuarioId: number;
  esAdmin: boolean;
  urlBase?: string;
}): ResultadoCambio {
  return transaccion(() => {
    const p = partida(d.partidaId);
    exigir(p, "Esa partida no existe.");
    const t = torneo(p.torneo_id);
    exigir(t, "Ese torneo no existe.");
    exigir(t.organizador_id === d.usuarioId || d.esAdmin, "Solo quien organiza el torneo puede cambiar a los jugadores.");
    exigir(t.estado === "en_curso", "Solo se cambian jugadores con el torneo en curso.");
    exigir(p.estado === "pendiente" || p.estado === "en_juego", "Esa partida ya tiene resultado.");
    exigir(d.equipoId === p.equipo_a || d.equipoId === p.equipo_b, "Ese equipo no juega esta partida.");
    const rival = d.equipoId === p.equipo_a ? p.equipo_b : p.equipo_a;
    const equipos = equiposDe(t.id);
    const equipo = equipos.find((e) => e.id === d.equipoId)!;

    const ids = new Set(d.integrantes.filter((id) => equipo.integrantes.some((i) => i.usuario_id === id)));
    const nombres = d.suplentes
      .split(/[\s,;]+/)
      .map((s) => s.trim().replace(/^@/, ""))
      .filter(Boolean);
    for (const n of nombres) {
      const u = db().prepare("SELECT id FROM usuarios WHERE usuario = ?").get(n) as { id: number } | undefined;
      if (!u) throw new ErrorUsuario(`No hay nadie con el usuario «${n}» en la página.`);
      ids.add(u.id);
    }
    exigir(ids.size >= 1, "Elige al menos un jugador.");
    exigir(ids.size <= t.tam_equipo, `Por ${equipo.nombre} juegan como mucho ${t.tam_equipo}.`);
    if (rival) {
      const delRival = new Set(alineacion(p.id, rival).map((j) => j.usuario_id));
      const repetido = [...ids].find((id) => delRival.has(id));
      if (repetido) {
        const n = db().prepare("SELECT usuario FROM usuarios WHERE id = ?").get(repetido) as { usuario: string };
        throw new ErrorUsuario(`${n.usuario} ya juega por el rival en esta partida.`);
      }
    }

    const antes = alineacion(p.id, d.equipoId);
    const antesIds = new Set(antes.map((j) => j.usuario_id));
    exigir(antesIds.size !== ids.size || [...ids].some((id) => !antesIds.has(id)), "No cambiaste a ningún jugador.");

    db().prepare("DELETE FROM alineaciones WHERE partida_id = ? AND equipo_id = ?").run(p.id, d.equipoId);
    const ins = db().prepare("INSERT INTO alineaciones (partida_id, equipo_id, usuario_id) VALUES (?, ?, ?)");
    for (const id of ids) ins.run(p.id, d.equipoId, id);
    // Si ya se estaba jugando, vuelve a «por jugar»: hay que empezarla de nuevo
    // (y las apuestas nuevas se cierran entonces, como siempre).
    if (p.estado === "en_juego") db().prepare("UPDATE partidas SET estado = 'pendiente' WHERE id = ?").run(p.id);

    const despues = alineacion(p.id, d.equipoId);
    const despuesIds = new Set(despues.map((j) => j.usuario_id));
    const entran = despues.filter((j) => !antesIds.has(j.usuario_id)).map((j) => j.usuario);
    const salen = antes.filter((j) => !despuesIds.has(j.usuario_id)).map((j) => j.usuario);
    const cambio = [entran.length ? `entra ${entran.join(", ")}` : "", salen.length ? `sale ${salen.join(", ")}` : ""]
      .filter(Boolean)
      .join(" y ");
    const nombreRival = equipos.find((e) => e.id === rival)?.nombre ?? "su rival";
    const enfrentamiento = `${equipo.nombre} contra ${nombreRival}`;

    // Apuestas de esta partida: se devuelven y se reabren vacías.
    const abiertas = db()
      .prepare("SELECT id FROM mercados WHERE partida_id = ? AND estado IN ('abierto', 'cerrado')")
      .all(p.id) as { id: number }[];
    let devuelto = 0;
    let nuevaApuesta: number | null = null;
    const porPersona = new Map<number, number>();
    for (const { id } of abiertas) {
      const m = mercado(id)!;
      const jugadas = jugadasDe(id);
      for (const j of jugadas) porPersona.set(j.usuario_id, (porPersona.get(j.usuario_id) ?? 0) + j.monto);
      devuelto += jugadas.reduce((s, j) => s + j.monto, 0);
      const opciones = opcionesDe(id);
      anularMercado(id, `Cambió la alineación de ${equipo.nombre}, se devuelve`);
      nuevaApuesta = crearMercado({
        creadorId: m.creador_id,
        titulo: m.titulo,
        descripcion: `Se volvió a abrir porque cambió la alineación de ${equipo.nombre} (${cambio}).`,
        torneoId: m.torneo_id ?? undefined,
        partidaId: p.id,
        modalidad: m.modalidad,
        opciones: opciones.map((o) => ({ etiqueta: o.etiqueta, equipoId: o.equipo_id ?? undefined })),
      });
    }
    const enlace = nuevaApuesta ? `/apuestas/${nuevaApuesta}` : `/torneos/${t.id}`;
    for (const [usuario, monto] of porPersona) {
      avisar(
        usuario,
        `Cambió quién juega por ${equipo.nombre} en la partida contra ${nombreRival} (${t.nombre}): ${cambio}. Te devolvimos ${soles(monto)} de tu apuesta. Si quieres, vuelve a apostar con los jugadores nuevos.`,
        enlace,
      );
    }
    const base = (d.urlBase ?? "").replace(/\/$/, "");
    const mensaje = [
      `⚠️ Cambio en ${enfrentamiento} (${t.nombre}): ${cambio}.`,
      porPersona.size
        ? `Se devolvió todo lo apostado (${soles(devuelto)} a ${porPersona.size} ${porPersona.size === 1 ? "persona" : "personas"}). Si quieren, vuelvan a apostar: ${base}${enlace}`
        : `Si quieren apostar: ${base}/torneos/${t.id}`,
    ].join("\n");
    return { entran, salen, devuelto, apostadores: porPersona.size, nuevaApuesta, mensaje };
  });
}
