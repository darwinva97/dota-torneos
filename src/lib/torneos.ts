import "server-only";
import crypto from "node:crypto";
import { db, transaccion } from "./db";
import { exigir } from "./errores";
import { exigirSinDeudas, mover } from "./billetera";
import { soles } from "./dinero";
import { anularMercado, cerrarPorPartida, resolverPorEquipo } from "./mercados";

export type EstadoTorneo = "inscripciones" | "en_curso" | "finalizado" | "cancelado";
export type Reparto = "ganador" | "70-30";

export type Asistencia = "a_tiempo" | "falto" | null;

export type Torneo = {
  id: number;
  nombre: string;
  descripcion: string;
  /** Lo que cada jugador pone al pozo. */
  entrada: number;
  /** Garantía de puntualidad por jugador (0 = sin garantía). */
  garantia: number;
  limite_llegada: string;
  tam_equipo: number;
  max_equipos: number;
  reparto: Reparto;
  estado: EstadoTorneo;
  organizador_id: number;
  organizador: string;
  fecha: string;
  campeon_id: number | null;
  /** Lo que el organizador puso de su saldo como premio base. */
  premio_base: number;
  /** 1: lo recaudado se suma al premio. 0: premio fijo y lo recaudado va al organizador. */
  suma_recaudado: number;
  /** Entradas más las garantías que ya pasaron al pozo. */
  recaudado: number;
  /** Lo que se reparte al final: base + (recaudado si se suma). */
  pozo: number;
  /** Garantías cobradas que todavía no se liquidan (antes del sorteo). */
  garantias_pendientes: number;
  equipos: number;
  jugadores: number;
};

export type Equipo = {
  id: number;
  nombre: string;
  capitan_id: number;
  integrantes: {
    usuario_id: number;
    usuario: string;
    nick_dota: string;
    aporte: number;
    garantia: number;
    asistencia: Asistencia;
  }[];
};

export type Partida = {
  id: number;
  ronda: number;
  pos: number;
  equipo_a: number | null;
  equipo_b: number | null;
  ganador: number | null;
  estado: "pendiente" | "en_juego" | "jugada" | "bye";
};

const SELECT_TORNEO = `
  SELECT t.*, u.usuario AS organizador,
    COALESCE((SELECT SUM(aporte + garantia_pozo) FROM integrantes i WHERE i.torneo_id = t.id), 0) AS recaudado,
    t.premio_base + CASE WHEN t.suma_recaudado
      THEN COALESCE((SELECT SUM(aporte + garantia_pozo) FROM integrantes i WHERE i.torneo_id = t.id), 0) ELSE 0 END
      AS pozo,
    CASE WHEN t.estado = 'inscripciones'
      THEN COALESCE((SELECT SUM(garantia) FROM integrantes i WHERE i.torneo_id = t.id), 0) ELSE 0 END
      AS garantias_pendientes,
    (SELECT COUNT(*) FROM equipos e WHERE e.torneo_id = t.id) AS equipos,
    (SELECT COUNT(*) FROM integrantes i WHERE i.torneo_id = t.id) AS jugadores
  FROM torneos t JOIN usuarios u ON u.id = t.organizador_id`;

export function torneo(id: number) {
  return db().prepare(`${SELECT_TORNEO} WHERE t.id = ?`).get(id) as Torneo | undefined;
}

export function listarTorneos() {
  return db()
    .prepare(
      `${SELECT_TORNEO} ORDER BY CASE t.estado
         WHEN 'en_curso' THEN 0 WHEN 'inscripciones' THEN 1 ELSE 2 END, t.id DESC LIMIT 60`,
    )
    .all() as Torneo[];
}

export function torneosDe(usuarioId: number) {
  return db()
    .prepare(
      `${SELECT_TORNEO} WHERE t.estado IN ('inscripciones','en_curso') AND
         (t.organizador_id = ? OR EXISTS (SELECT 1 FROM integrantes i WHERE i.torneo_id = t.id AND i.usuario_id = ?))
       ORDER BY t.id DESC`,
    )
    .all(usuarioId, usuarioId) as Torneo[];
}

export function equiposDe(torneoId: number): Equipo[] {
  const equipos = db()
    .prepare("SELECT id, nombre, capitan_id FROM equipos WHERE torneo_id = ? ORDER BY id")
    .all(torneoId) as Omit<Equipo, "integrantes">[];
  const integrantes = db()
    .prepare(
      `SELECT i.equipo_id, i.usuario_id, u.usuario, u.nick_dota, i.aporte, i.garantia, i.asistencia
       FROM integrantes i JOIN usuarios u ON u.id = i.usuario_id
       WHERE i.torneo_id = ? ORDER BY i.creado`,
    )
    .all(torneoId) as (Equipo["integrantes"][number] & { equipo_id: number })[];
  return equipos.map((e) => ({ ...e, integrantes: integrantes.filter((i) => i.equipo_id === e.id) }));
}

export function partidasDe(torneoId: number) {
  return db()
    .prepare("SELECT * FROM partidas WHERE torneo_id = ? ORDER BY ronda, pos")
    .all(torneoId) as Partida[];
}

export function crearTorneo(d: {
  organizadorId: number;
  nombre: string;
  descripcion: string;
  entrada: number | null;
  garantia: number | null;
  limiteLlegada: string;
  tamEquipo: number;
  maxEquipos: number;
  reparto: string;
  fecha: string;
  premioBase: number | null;
  sumaRecaudado: boolean;
}) {
  exigir(d.nombre.trim().length >= 3, "Ponle un nombre al torneo.");
  exigir(d.premioBase !== null && d.premioBase >= 0, "Escribe el premio base en soles, o 0 si no pones nada.");
  exigir(
    d.sumaRecaudado || d.premioBase > 0,
    "Con premio fijo hace falta un premio base: si no, no habría nada que ganar.",
  );
  exigir(d.entrada !== null && d.entrada >= 0, "Escribe cuánto pone cada jugador al pozo (puede ser 0).");
  exigir(d.garantia !== null && d.garantia >= 0, "Escribe la garantía en soles, o 0 si no hay garantía.");
  exigir(d.tamEquipo >= 1 && d.tamEquipo <= 5, "Los equipos son de 1 a 5 jugadores.");
  exigir(d.maxEquipos >= 2 && d.maxEquipos <= 16, "El torneo admite de 2 a 16 equipos.");
  exigir(d.reparto === "ganador" || d.reparto === "70-30", "Elige cómo se reparte el pozo.");
  return transaccion(() => {
    const r = db()
      .prepare(
        `INSERT INTO torneos (nombre, descripcion, entrada, garantia, limite_llegada, tam_equipo, max_equipos,
           reparto, organizador_id, fecha, premio_base, suma_recaudado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.nombre.trim(),
        d.descripcion.trim(),
        d.entrada,
        d.garantia,
        d.garantia ? d.limiteLlegada.trim() : "",
        d.tamEquipo,
        d.maxEquipos,
        d.reparto,
        d.organizadorId,
        d.fecha.trim(),
        d.premioBase,
        d.sumaRecaudado ? 1 : 0,
      );
    // El premio base sale del saldo del organizador y queda reservado.
    if (d.premioBase! > 0) {
      exigirSinDeudas(d.organizadorId);
      mover(d.organizadorId, -d.premioBase!, "premio_base", `Premio base de ${d.nombre.trim()}`);
    }
    return Number(r.lastInsertRowid);
  });
}

// Solo quien organiza puede subir el premio, porque al cancelar se le devuelve
// a él todo el premio base.
export function aumentarPremio(torneoId: number, usuarioId: number, monto: number) {
  exigir(monto >= 100, "Aumenta el premio en S/ 1.00 o más.");
  transaccion(() => {
    const t = torneo(torneoId);
    exigir(t, "Ese torneo no existe.");
    exigir(t.organizador_id === usuarioId, "Solo quien organiza el torneo puede aumentar el premio.");
    exigir(t.estado === "inscripciones" || t.estado === "en_curso", "Este torneo ya terminó.");
    exigirSinDeudas(usuarioId);
    mover(usuarioId, -monto, "premio_base", `Aumentaste el premio de ${t.nombre}`);
    db().prepare("UPDATE torneos SET premio_base = premio_base + ? WHERE id = ?").run(monto, torneoId);
  });
}

function exigirInscripciones(torneoId: number) {
  const t = torneo(torneoId);
  exigir(t, "Ese torneo no existe.");
  exigir(t.estado === "inscripciones", "Las inscripciones de este torneo ya están cerradas.");
  return t;
}

function exigirLibre(torneoId: number, usuarioId: number) {
  const ya = db()
    .prepare("SELECT 1 FROM integrantes WHERE torneo_id = ? AND usuario_id = ?")
    .get(torneoId, usuarioId);
  exigir(!ya, "Ya estás inscrito en un equipo de este torneo.");
}

// La inscripción son dos movimientos: lo que va al pozo y la garantía, que se
// liquida al sortear el cuadro según la asistencia.
function pagarEntrada(t: Torneo, usuarioId: number, equipoId: number) {
  exigirSinDeudas(usuarioId);
  if (t.entrada > 0) mover(usuarioId, -t.entrada, "inscripcion", `Entrada al pozo de ${t.nombre}`);
  if (t.garantia > 0) mover(usuarioId, -t.garantia, "garantia", `Garantía de puntualidad de ${t.nombre}`);
  db()
    .prepare("INSERT INTO integrantes (torneo_id, usuario_id, equipo_id, aporte, garantia) VALUES (?, ?, ?, ?, ?)")
    .run(t.id, usuarioId, equipoId, t.entrada, t.garantia);
}

export function costoInscripcion(t: Pick<Torneo, "entrada" | "garantia">) {
  return t.entrada + t.garantia;
}

export function crearEquipo(torneoId: number, usuarioId: number, nombre: string) {
  exigir(nombre.trim().length >= 2, "Ponle nombre al equipo.");
  transaccion(() => {
    const t = exigirInscripciones(torneoId);
    exigirLibre(torneoId, usuarioId);
    exigir(t.equipos < t.max_equipos, "Ya no caben más equipos en este torneo.");
    const repetido = db()
      .prepare("SELECT 1 FROM equipos WHERE torneo_id = ? AND nombre = ? COLLATE NOCASE")
      .get(torneoId, nombre.trim());
    exigir(!repetido, "Ya hay un equipo con ese nombre.");
    const r = db()
      .prepare("INSERT INTO equipos (torneo_id, nombre, capitan_id) VALUES (?, ?, ?)")
      .run(torneoId, nombre.trim(), usuarioId);
    pagarEntrada(t, usuarioId, Number(r.lastInsertRowid));
  });
}

export function unirseEquipo(equipoId: number, usuarioId: number) {
  transaccion(() => {
    const e = db().prepare("SELECT torneo_id FROM equipos WHERE id = ?").get(equipoId) as
      | { torneo_id: number }
      | undefined;
    exigir(e, "Ese equipo no existe.");
    const t = exigirInscripciones(e.torneo_id);
    exigirLibre(t.id, usuarioId);
    const { n } = db().prepare("SELECT COUNT(*) AS n FROM integrantes WHERE equipo_id = ?").get(equipoId) as {
      n: number;
    };
    exigir(n < t.tam_equipo, "Ese equipo ya está completo.");
    pagarEntrada(t, usuarioId, equipoId);
  });
}

// Antes de empezar, cualquiera puede salirse y recupera su entrada.
export function salirDeTorneo(torneoId: number, usuarioId: number) {
  transaccion(() => {
    const t = exigirInscripciones(torneoId);
    const i = db()
      .prepare("SELECT equipo_id, aporte, garantia FROM integrantes WHERE torneo_id = ? AND usuario_id = ?")
      .get(torneoId, usuarioId) as { equipo_id: number; aporte: number; garantia: number } | undefined;
    exigir(i, "No estás inscrito en este torneo.");
    db().prepare("DELETE FROM integrantes WHERE torneo_id = ? AND usuario_id = ?").run(torneoId, usuarioId);
    if (i.aporte > 0) mover(usuarioId, i.aporte, "inscripcion_devuelta", `Saliste del torneo ${t.nombre}`);
    if (i.garantia > 0) mover(usuarioId, i.garantia, "garantia_devuelta", `Saliste del torneo ${t.nombre}`);

    const siguiente = db()
      .prepare("SELECT usuario_id FROM integrantes WHERE equipo_id = ? ORDER BY creado LIMIT 1")
      .get(i.equipo_id) as { usuario_id: number } | undefined;
    if (!siguiente) {
      db().prepare("DELETE FROM equipos WHERE id = ?").run(i.equipo_id);
    } else {
      // Si se va el capitán, hereda la capitanía el siguiente que entró.
      db()
        .prepare("UPDATE equipos SET capitan_id = ? WHERE id = ? AND capitan_id = ?")
        .run(siguiente.usuario_id, i.equipo_id, usuarioId);
    }
  });
}

function exigirOrganizador(t: Torneo | undefined, usuarioId: number, esAdmin: boolean): asserts t is Torneo {
  exigir(t, "Ese torneo no existe.");
  exigir(t.organizador_id === usuarioId || esAdmin, "Solo quien organiza el torneo puede hacer esto.");
}

// Quien organiza marca, antes del sorteo, si cada jugador llegó a tiempo.
export function marcarAsistencia(
  torneoId: number,
  jugadorId: number,
  asistencia: "a_tiempo" | "falto" | null,
  usuarioId: number,
  esAdmin: boolean,
) {
  const t = torneo(torneoId);
  exigirOrganizador(t, usuarioId, esAdmin);
  exigir(t.estado === "inscripciones", "La asistencia se marca antes de sortear el cuadro.");
  exigir(t.garantia > 0, "Este torneo no tiene garantía de puntualidad.");
  const r = db()
    .prepare("UPDATE integrantes SET asistencia = ? WHERE torneo_id = ? AND usuario_id = ?")
    .run(asistencia, torneoId, jugadorId);
  exigir(r.changes === 1, "Ese jugador no está inscrito.");
}

// Devuelve la garantía a quien llegó a tiempo y pasa al pozo la de quien faltó.
function liquidarGarantias(t: Torneo) {
  const filas = db()
    .prepare("SELECT usuario_id, garantia, asistencia FROM integrantes WHERE torneo_id = ? AND garantia > 0")
    .all(t.id) as { usuario_id: number; garantia: number; asistencia: Asistencia }[];
  const sinMarcar = filas.filter((f) => f.asistencia === null).length;
  exigir(
    sinMarcar === 0,
    `Falta marcar la asistencia de ${sinMarcar} ${sinMarcar === 1 ? "jugador" : "jugadores"} antes de sortear.`,
  );
  for (const f of filas) {
    if (f.asistencia === "a_tiempo") {
      mover(f.usuario_id, f.garantia, "garantia_devuelta", `Llegaste a tiempo a ${t.nombre}`);
    } else {
      db()
        .prepare("UPDATE integrantes SET garantia_pozo = garantia WHERE torneo_id = ? AND usuario_id = ?")
        .run(t.id, f.usuario_id);
    }
  }
}

// Arma un cuadro de eliminación directa. Con n equipos el cuadro es de la
// potencia de 2 siguiente (p); en la primera ronda el equipo i juega contra el
// i + p/2, así los descansos (bye) nunca enfrentan a dos huecos.
export function iniciarTorneo(torneoId: number, usuarioId: number, esAdmin: boolean) {
  transaccion(() => {
    const t = torneo(torneoId);
    exigirOrganizador(t, usuarioId, esAdmin);
    exigir(t.estado === "inscripciones", "El torneo ya empezó.");
    const equipos = equiposDe(torneoId).map((e) => e.id);
    exigir(equipos.length >= 2, "Hacen falta al menos dos equipos para empezar.");
    liquidarGarantias(t);

    for (let i = equipos.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [equipos[i], equipos[j]] = [equipos[j], equipos[i]];
    }
    const p = 2 ** Math.ceil(Math.log2(equipos.length));
    const rondas = Math.log2(p);
    const ins = db().prepare(
      "INSERT INTO partidas (torneo_id, ronda, pos, equipo_a, equipo_b, ganador, estado) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (let r = 1; r <= rondas; r++) {
      for (let pos = 0; pos < p / 2 ** r; pos++) {
        if (r === 1) {
          const a = equipos[pos];
          const b = equipos[pos + p / 2] ?? null;
          ins.run(torneoId, r, pos, a, b, b === null ? a : null, b === null ? "bye" : "pendiente");
        } else {
          ins.run(torneoId, r, pos, null, null, null, "pendiente");
        }
      }
    }
    db().prepare("UPDATE torneos SET estado = 'en_curso' WHERE id = ?").run(torneoId);
    for (const pt of partidasDe(torneoId)) if (pt.estado === "bye") avanzar(torneoId, pt, rondas);
  });
}

function avanzar(torneoId: number, pt: Partida, rondas: number) {
  if (pt.ronda === rondas) return;
  const lado = pt.pos % 2 === 0 ? "equipo_a" : "equipo_b";
  db()
    .prepare(`UPDATE partidas SET ${lado} = ? WHERE torneo_id = ? AND ronda = ? AND pos = ?`)
    .run(pt.ganador, torneoId, pt.ronda + 1, Math.floor(pt.pos / 2));
}

export function marcarEnJuego(partidaId: number, usuarioId: number, esAdmin: boolean) {
  transaccion(() => {
    const pt = db().prepare("SELECT * FROM partidas WHERE id = ?").get(partidaId) as
      | (Partida & { torneo_id: number })
      | undefined;
    exigir(pt, "Esa partida no existe.");
    exigirOrganizador(torneo(pt.torneo_id), usuarioId, esAdmin);
    exigir(pt.estado === "pendiente" && pt.equipo_a && pt.equipo_b, "Esa partida no se puede empezar ahora.");
    db().prepare("UPDATE partidas SET estado = 'en_juego' WHERE id = ?").run(partidaId);
    cerrarPorPartida(partidaId);
  });
}

export function reportarGanador(partidaId: number, equipoId: number, usuarioId: number, esAdmin: boolean) {
  transaccion(() => {
    const pt = db().prepare("SELECT * FROM partidas WHERE id = ?").get(partidaId) as
      | (Partida & { torneo_id: number })
      | undefined;
    exigir(pt, "Esa partida no existe.");
    const t = torneo(pt.torneo_id);
    exigirOrganizador(t, usuarioId, esAdmin);
    exigir(t.estado === "en_curso", "El torneo no está en curso.");
    exigir(pt.estado === "pendiente" || pt.estado === "en_juego", "Esa partida ya tiene resultado.");
    exigir(pt.equipo_a && pt.equipo_b, "Todavía falta un equipo en esa partida.");
    exigir(equipoId === pt.equipo_a || equipoId === pt.equipo_b, "Ese equipo no juega esta partida.");

    db().prepare("UPDATE partidas SET ganador = ?, estado = 'jugada' WHERE id = ?").run(equipoId, partidaId);
    resolverPorEquipo({ partidaId }, equipoId);

    const rondas = (
      db().prepare("SELECT MAX(ronda) AS r FROM partidas WHERE torneo_id = ?").get(t.id) as { r: number }
    ).r;
    if (pt.ronda < rondas) {
      avanzar(t.id, { ...pt, ganador: equipoId }, rondas);
    } else {
      const subcampeon = equipoId === pt.equipo_a ? pt.equipo_b : pt.equipo_a;
      finalizar(t, equipoId, subcampeon);
    }
  });
}

// Reparte el pozo entre los integrantes de los equipos premiados, a partes
// iguales. Los céntimos que no se dividen exacto van a los primeros inscritos.
function finalizar(t: Torneo, campeon: number, subcampeon: number) {
  const premios: [number, number][] =
    t.reparto === "70-30"
      ? [
          [campeon, Math.floor(t.pozo * 0.7)],
          [subcampeon, t.pozo - Math.floor(t.pozo * 0.7)],
        ]
      : [[campeon, t.pozo]];
  const equipos = equiposDe(t.id);
  for (const [equipoId, total] of premios) {
    const e = equipos.find((x) => x.id === equipoId);
    if (!e || total <= 0 || e.integrantes.length === 0) continue;
    const base = Math.floor(total / e.integrantes.length);
    let resto = total - base * e.integrantes.length;
    for (const i of e.integrantes) {
      const monto = base + (resto-- > 0 ? 1 : 0);
      const puesto = equipoId === campeon ? "Campeón" : "Subcampeón";
      mover(i.usuario_id, monto, "premio", `${puesto} de ${t.nombre} (${soles(total)} para ${e.nombre})`);
    }
  }
  // Con premio fijo, lo recaudado no entra al premio: se lo lleva el organizador.
  if (!t.suma_recaudado && t.recaudado > 0) {
    mover(t.organizador_id, t.recaudado, "recaudacion", `Recaudación de ${t.nombre} (premio fijo)`);
  }
  db().prepare("UPDATE torneos SET estado = 'finalizado', campeon_id = ? WHERE id = ?").run(campeon, t.id);
  resolverPorEquipo({ torneoCampeon: t.id }, campeon);
}

export function cancelarTorneo(torneoId: number, usuarioId: number, esAdmin: boolean) {
  transaccion(() => {
    const t = torneo(torneoId);
    exigirOrganizador(t, usuarioId, esAdmin);
    exigir(t.estado === "inscripciones" || t.estado === "en_curso", "Este torneo ya terminó.");
    const aportes = db()
      .prepare("SELECT usuario_id, aporte, garantia, garantia_pozo FROM integrantes WHERE torneo_id = ?")
      .all(torneoId) as { usuario_id: number; aporte: number; garantia: number; garantia_pozo: number }[];
    for (const a of aportes) {
      if (a.aporte > 0) mover(a.usuario_id, a.aporte, "inscripcion_devuelta", `Torneo cancelado: ${t.nombre}`);
      // Antes del sorteo la garantía sigue retenida entera; después, solo queda
      // la de quien faltó (la de quien llegó a tiempo ya se devolvió).
      const garantia = t.estado === "inscripciones" ? a.garantia : a.garantia_pozo;
      if (garantia > 0) mover(a.usuario_id, garantia, "garantia_devuelta", `Torneo cancelado: ${t.nombre}`);
    }
    const mercados = db()
      .prepare("SELECT id FROM mercados WHERE torneo_id = ? AND estado IN ('abierto','cerrado')")
      .all(torneoId) as { id: number }[];
    for (const m of mercados) anularMercado(m.id, "Torneo cancelado");
    if (t.premio_base > 0) {
      mover(t.organizador_id, t.premio_base, "premio_base_devuelto", `Torneo cancelado: ${t.nombre}`);
    }
    db().prepare("UPDATE torneos SET estado = 'cancelado' WHERE id = ?").run(torneoId);
  });
}
