import "server-only";
import { moverAcumulado, saldoAcumulado } from "./acumulado";
import crypto from "node:crypto";
import { db, transaccion } from "./db";
import { exigir } from "./errores";
import { exigirSinDeudas, mover } from "./billetera";
import {
  anularMercado,
  cerrarPorPartida,
  empatarPorPartida,
  exigirParchadasDePartida,
  resolverPorEquipo,
} from "./mercados";
import { generarCuadro, type Lado, type Llave } from "./llaves";
import { clasificacion, rondaSuiza, rondasLiga, type Juego as JuegoPuntos, type Resultado } from "./puntos";
import { esLichess, problemaRitmoLichess, rondasSuizo, type Formato } from "./formatos";

export type EstadoTorneo = "inscripciones" | "en_curso" | "finalizado" | "cancelado";
export type Reparto = "ganador" | "70-30";

export type Asistencia = "a_tiempo" | "falto" | null;

import type { Juego } from "./juegos";
export { RITMOS_AJEDREZ, nombreJuego, type Juego } from "./juegos";

export type Torneo = {
  id: number;
  nombre: string;
  juego: Juego;
  formato: Formato;
  /** Mixto: cuántos equipos pasan del descarte a upper y lower. */
  clasifican: number;
  /** Suizo: número de rondas. */
  rondas: number;
  /** Arena en Lichess: minutos que dura. */
  duracion: number;
  lichess_id: string;
  lichess_clave: string;
  lichess_equipo: string;
  lichess_sync: number;
  /** Solo en ajedrez: modalidad y ritmo, como «blitz 3+2». */
  ritmo: string;
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
  /** Lo que puso el admin del pozo acumulado de la página. */
  pozo_pagina: number;
  /** 1: lo recaudado se suma al premio. 0: premio fijo y lo recaudado va al organizador. */
  suma_recaudado: number;
  /** Entradas más las garantías que ya pasaron al pozo. */
  recaudado: number;
  /** Lo que se reparte al final: base + pozo de la página + (recaudado si se suma). */
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
    lichess_usuario: string;
    lichess_inscrito: number;
  }[];
};

export type Partida = {
  id: number;
  torneo_id: number;
  llave: Llave | "RR" | "SW";
  ronda: number;
  pos: number;
  equipo_a: number | null;
  equipo_b: number | null;
  lista_a: number;
  lista_b: number;
  ganador: number | null;
  resultado: Resultado | null;
  estado: "pendiente" | "en_juego" | "jugada" | "bye";
  sig_ganador: number | null;
  lado_ganador: Lado | null;
  sig_perdedor: number | null;
  lado_perdedor: Lado | null;
};

const SELECT_TORNEO = `
  SELECT t.*, u.usuario AS organizador,
    COALESCE((SELECT SUM(aporte + garantia_pozo) FROM integrantes i WHERE i.torneo_id = t.id), 0) AS recaudado,
    t.premio_base + t.pozo_pagina + CASE WHEN t.suma_recaudado
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
      `SELECT i.equipo_id, i.usuario_id, u.usuario, u.nick_dota, i.aporte, i.garantia, i.asistencia,
         u.lichess_usuario, i.lichess_inscrito
       FROM integrantes i JOIN usuarios u ON u.id = i.usuario_id
       WHERE i.torneo_id = ? ORDER BY i.creado`,
    )
    .all(torneoId) as (Equipo["integrantes"][number] & { equipo_id: number })[];
  return equipos.map((e) => ({ ...e, integrantes: integrantes.filter((i) => i.equipo_id === e.id) }));
}

export function partidasDe(torneoId: number) {
  return db()
    .prepare(
      `SELECT * FROM partidas WHERE torneo_id = ?
       ORDER BY CASE llave WHEN 'Q' THEN 0 WHEN 'U' THEN 1 WHEN 'L' THEN 2 WHEN 'GF' THEN 3 ELSE 4 END, ronda, pos`,
    )
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
  /** % del pozo acumulado de la página que va al premio (solo el admin). */
  acumuladoPct?: number;
  esAdmin?: boolean;
  juego?: Juego;
  ritmo?: string;
  formato?: Formato;
  clasifican?: number;
  rondas?: number;
  duracion?: number;
  lichessEquipo?: string;
}) {
  const juego = d.juego ?? "dota2";
  const formato = d.formato ?? "eliminacion";
  const validos: Record<Juego, Formato[]> = {
    dota2: ["eliminacion", "doble", "mixto"],
    ajedrez: ["eliminacion", "liga", "suizo", "lichess_arena", "lichess_suizo"],
  };
  exigir(validos[juego]?.includes(formato), "Elige un formato de torneo válido para ese juego.");
  const clasifican = formato === "mixto" ? (d.clasifican ?? 8) : 0;
  exigir(formato !== "mixto" || clasifican === 4 || clasifican === 8, "En el formato combinado pasan 4 u 8 equipos.");
  const rondas = formato === "suizo" || formato === "lichess_suizo" ? (d.rondas ?? 0) : 0;
  exigir(rondas >= 0 && rondas <= 15, "Un suizo tiene como mucho 15 rondas.");
  const duracion = formato === "lichess_arena" ? (d.duracion ?? 60) : 0;
  const lichessEquipo = formato === "lichess_suizo" ? (d.lichessEquipo ?? "").trim() : "";
  if (esLichess(formato)) {
    const problema = problemaRitmoLichess(formato, d.ritmo ?? "", duracion);
    exigir(!problema, problema ?? "");
  }
  exigir(
    formato !== "lichess_suizo" || /^[a-z0-9-]{2,}$/i.test(lichessEquipo),
    "El suizo de Lichess necesita el id de un equipo de Lichess del que seas líder (lo que va tras lichess.org/team/).",
  );
  exigir(juego === "dota2" || juego === "ajedrez", "Elige el juego.");
  // El ajedrez se juega uno contra uno.
  if (juego === "ajedrez") d.tamEquipo = 1;
  const ritmo = juego === "ajedrez" ? (d.ritmo ?? "").trim() : "";
  exigir(juego !== "ajedrez" || ritmo.length >= 3, "Elige la modalidad de ajedrez o escribe el ritmo, por ejemplo 3+2.");
  exigir(d.nombre.trim().length >= 3, "Ponle un nombre al torneo.");
  exigir(d.premioBase !== null && d.premioBase >= 0, "Escribe el premio base en soles, o 0 si no pones nada.");
  const acumuladoPct = d.acumuladoPct ?? 0;
  exigir(Number.isInteger(acumuladoPct) && acumuladoPct >= 0 && acumuladoPct <= 100, "Elige qué parte del pozo acumulado va al premio.");
  exigir(acumuladoPct === 0 || d.esAdmin, "Solo el admin puede poner el pozo acumulado de la página en un torneo.");
  const deAcumulado = Math.floor((saldoAcumulado() * acumuladoPct) / 100);
  exigir(acumuladoPct === 0 || deAcumulado > 0, "El pozo acumulado está vacío: todavía no hay nada que poner.");
  exigir(
    d.sumaRecaudado || d.premioBase > 0 || deAcumulado > 0,
    "Con premio fijo hace falta un premio base o parte del pozo acumulado: si no, no habría nada que ganar.",
  );
  exigir(d.entrada !== null && d.entrada >= 0, "Escribe cuánto pone cada jugador al pozo (puede ser 0).");
  exigir(d.garantia !== null && d.garantia >= 0, "Escribe la garantía en soles, o 0 si no hay garantía.");
  exigir(d.tamEquipo >= 1 && d.tamEquipo <= 5, "Los equipos son de 1 a 5 jugadores.");
  exigir(d.maxEquipos >= 2 && d.maxEquipos <= 64, "El torneo admite de 2 a 64 equipos.");
  exigir(d.reparto === "ganador" || d.reparto === "70-30", "Elige cómo se reparte el pozo.");
  return transaccion(() => {
    const r = db()
      .prepare(
        `INSERT INTO torneos (nombre, descripcion, entrada, garantia, limite_llegada, tam_equipo, max_equipos,
           reparto, organizador_id, fecha, premio_base, suma_recaudado, juego, ritmo,
           formato, clasifican, rondas, duracion, lichess_equipo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        juego,
        ritmo,
        formato,
        clasifican,
        rondas,
        duracion,
        lichessEquipo,
      );
    // El premio base sale del saldo del organizador y queda reservado.
    if (d.premioBase! > 0) {
      exigirSinDeudas(d.organizadorId);
      mover(d.organizadorId, -d.premioBase!, "premio_base", `Premio base de ${d.nombre.trim()}`);
    }
    const id = Number(r.lastInsertRowid);
    // La parte del pozo acumulado se aparta ya, para que nadie más la use. Lo
    // que no se pone queda para el siguiente torneo.
    if (deAcumulado > 0) {
      moverAcumulado(-deAcumulado, `Premio del torneo ${d.nombre.trim()} (${acumuladoPct} % del pozo)`, { torneoId: id });
      db().prepare("UPDATE torneos SET pozo_pagina = ? WHERE id = ?").run(deAcumulado, id);
    }
    return id;
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

// El admin suma al premio otra parte del pozo acumulado (por ejemplo, lo que
// creció con las apuestas del propio torneo).
export function sumarAcumulado(torneoId: number, pct: number, esAdmin: boolean) {
  exigir(esAdmin, "Solo el admin puede usar el pozo acumulado de la página.");
  exigir(Number.isInteger(pct) && pct > 0 && pct <= 100, "Elige qué parte del pozo acumulado sumas.");
  transaccion(() => {
    const t = torneo(torneoId);
    exigir(t, "Ese torneo no existe.");
    exigir(t.estado === "inscripciones" || t.estado === "en_curso", "Este torneo ya terminó.");
    const monto = Math.floor((saldoAcumulado() * pct) / 100);
    exigir(monto > 0, "El pozo acumulado está vacío.");
    moverAcumulado(-monto, `Premio del torneo ${t.nombre} (${pct} % del pozo)`, { torneoId });
    db().prepare("UPDATE torneos SET pozo_pagina = pozo_pagina + ? WHERE id = ?").run(monto, torneoId);
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
  if (esLichess(t.formato)) {
    const u = db().prepare("SELECT lichess_usuario FROM usuarios WHERE id = ?").get(usuarioId) as { lichess_usuario: string };
    exigir(u.lichess_usuario, "Este torneo se juega en Lichess: conecta tu cuenta de Lichess en Perfil para inscribirte.");
  }
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

function barajar<T>(xs: T[]) {
  const v = [...xs];
  for (let i = v.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [v[i], v[j]] = [v[j], v[i]];
  }
  return v;
}

// Comprobaciones comunes antes de cerrar inscripciones (también para Lichess,
// que crea el torneo allí antes de pasar a «en curso»).
export function prepararInicio(torneoId: number, usuarioId: number, esAdmin: boolean) {
  const t = torneo(torneoId);
  exigirOrganizador(t, usuarioId, esAdmin);
  exigir(t.estado === "inscripciones", "El torneo ya empezó.");
  exigir(equiposDe(torneoId).length >= 2, "Hacen falta al menos dos inscritos para empezar.");
  const sinMarcar = db()
    .prepare("SELECT COUNT(*) AS n FROM integrantes WHERE torneo_id = ? AND garantia > 0 AND asistencia IS NULL")
    .get(torneoId) as { n: number };
  exigir(
    sinMarcar.n === 0,
    `Falta marcar la asistencia de ${sinMarcar.n} ${sinMarcar.n === 1 ? "jugador" : "jugadores"} antes de sortear.`,
  );
  return t;
}

// Cierra inscripciones y arma el torneo según su formato. Los de Lichess se
// inician con iniciarEnLichess (lib/lichess.ts), que llama a marcarEnCurso.
export function iniciarTorneo(torneoId: number, usuarioId: number, esAdmin: boolean) {
  transaccion(() => {
    const t = prepararInicio(torneoId, usuarioId, esAdmin);
    exigir(!esLichess(t.formato), "Este torneo se juega en Lichess: se inicia desde allí.");
    marcarEnCurso(t);
    const equipos = barajar(equiposDe(torneoId).map((e) => e.id));
    if (t.formato === "liga") {
      rondasLiga(equipos).forEach((ronda, r) => guardarRonda(t.id, "RR", r + 1, ronda));
    } else if (t.formato === "suizo") {
      const rondas = t.rondas || rondasSuizo(equipos.length);
      db().prepare("UPDATE torneos SET rondas = ? WHERE id = ?").run(rondas, t.id);
      guardarRonda(t.id, "SW", 1, rondaSuiza(equipos, []));
    } else {
      crearCuadro(t, equipos);
    }
  });
}

export function marcarEnCurso(t: Torneo) {
  liquidarGarantias(t);
  db().prepare("UPDATE torneos SET estado = 'en_curso' WHERE id = ?").run(t.id);
}

// --- Cuadros (eliminación, upper y lower, mixto) ---

function crearCuadro(t: Torneo, equipos: number[]) {
  const nodos = generarCuadro(t.formato as "eliminacion" | "doble" | "mixto", equipos, t.clasifican || 8);
  const ids = new Map<string, number>();
  const ins = db().prepare(
    `INSERT INTO partidas (torneo_id, llave, ronda, pos, equipo_a, equipo_b, lista_a, lista_b)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const n of nodos) {
    const lado = (h: (typeof n)["a"]) => (h === "espera" ? [null, 0] : [h.equipo, 1]);
    const [a, la] = lado(n.a);
    const [b, lb] = lado(n.b);
    ids.set(n.clave, Number(ins.run(t.id, n.llave, n.ronda, n.pos, a, b, la, lb).lastInsertRowid));
  }
  const cruces = db().prepare(
    "UPDATE partidas SET sig_ganador = ?, lado_ganador = ?, sig_perdedor = ?, lado_perdedor = ? WHERE id = ?",
  );
  for (const n of nodos) {
    cruces.run(
      n.ganador ? ids.get(n.ganador.clave) : null,
      n.ganador?.lado ?? null,
      n.perdedor ? ids.get(n.perdedor.clave) : null,
      n.perdedor?.lado ?? null,
      ids.get(n.clave),
    );
  }
  // Las partidas que ya tienen sus dos lados decididos y algún hueco vacío se
  // resuelven solas (pase directo), en orden para que se encadenen.
  for (const n of nodos) comprobarPartida(ids.get(n.clave)!);
}

function partida(id: number) {
  return db().prepare("SELECT * FROM partidas WHERE id = ?").get(id) as Partida;
}

// Coloca a un equipo (o un hueco vacío) en un lado de una partida.
function colocar(id: number | null, lado: Lado | null, equipo: number | null) {
  if (!id || !lado) return;
  db().prepare(`UPDATE partidas SET equipo_${lado} = ?, lista_${lado} = 1 WHERE id = ?`).run(equipo, id);
  comprobarPartida(id);
}

// Con los dos lados decididos: si falta un rival, pasa directo el otro.
function comprobarPartida(id: number) {
  const p = partida(id);
  if (p.estado !== "pendiente" || !p.lista_a || !p.lista_b) return;
  if (p.equipo_a !== null && p.equipo_b !== null) return; // se juega
  const ganador = p.equipo_a ?? p.equipo_b;
  db().prepare("UPDATE partidas SET ganador = ?, estado = 'bye' WHERE id = ?").run(ganador, id);
  if (p.sig_ganador) colocar(p.sig_ganador, p.lado_ganador, ganador);
  colocar(p.sig_perdedor, p.lado_perdedor, null);
  // Una final que se resuelve sola (no debería pasar con dos o más equipos).
  if (!p.sig_ganador && ganador) finalizarCuadro(torneo(p.torneo_id)!, ganador, null);
}

export function marcarEnJuego(partidaId: number, usuarioId: number, esAdmin: boolean) {
  transaccion(() => {
    const pt = partida(partidaId);
    exigir(pt, "Esa partida no existe.");
    exigirOrganizador(torneo(pt.torneo_id), usuarioId, esAdmin);
    exigir(pt.estado === "pendiente" && pt.equipo_a && pt.equipo_b, "Esa partida no se puede empezar ahora.");
    db().prepare("UPDATE partidas SET estado = 'en_juego' WHERE id = ?").run(partidaId);
    cerrarPorPartida(partidaId);
  });
}

// Resultado de una partida: gana A, gana B o tablas (solo en liga y suizo).
export function reportarResultado(partidaId: number, resultado: Resultado, usuarioId: number, esAdmin: boolean) {
  transaccion(() => {
    const pt = partida(partidaId);
    exigir(pt, "Esa partida no existe.");
    const t = torneo(pt.torneo_id);
    exigirOrganizador(t, usuarioId, esAdmin);
    exigir(t.estado === "en_curso", "El torneo no está en curso.");
    exigir(pt.estado === "pendiente" || pt.estado === "en_juego", "Esa partida ya tiene resultado.");
    exigir(pt.equipo_a && pt.equipo_b, "Todavía falta un rival en esa partida.");
    const porPuntos = pt.llave === "RR" || pt.llave === "SW";
    exigir(
      resultado !== "tablas" || porPuntos,
      "En eliminación no hay tablas: desempaten (por ejemplo, armagedón) y marca a quien pasa.",
    );
    const esFinal = porPuntos ? ultimaPorJugar(t.id) : !pt.sig_ganador;
    // Las apuestas parchadas de la partida (y del campeón, en la final) deben
    // estar iguales antes de resolverse.
    exigirParchadasDePartida(partidaId, esFinal ? t.id : undefined);

    const ganador = resultado === "a" ? pt.equipo_a : resultado === "b" ? pt.equipo_b : null;
    const perdedor = resultado === "a" ? pt.equipo_b : resultado === "b" ? pt.equipo_a : null;
    db()
      .prepare("UPDATE partidas SET ganador = ?, resultado = ?, estado = 'jugada' WHERE id = ?")
      .run(ganador, resultado, partidaId);
    if (ganador) resolverPorEquipo({ partidaId }, ganador);
    else empatarPorPartida(partidaId);

    if (porPuntos) {
      avanzarPorPuntos(torneo(t.id)!);
    } else if (pt.sig_ganador) {
      colocar(pt.sig_ganador, pt.lado_ganador, ganador);
      colocar(pt.sig_perdedor, pt.lado_perdedor, perdedor);
    } else {
      finalizarCuadro(t, ganador!, perdedor);
    }
  });
}

export function reportarGanador(partidaId: number, equipoId: number, usuarioId: number, esAdmin: boolean) {
  const pt = partida(partidaId);
  exigir(pt, "Esa partida no existe.");
  exigir(equipoId === pt.equipo_a || equipoId === pt.equipo_b, "Ese equipo no juega esta partida.");
  reportarResultado(partidaId, equipoId === pt.equipo_a ? "a" : "b", usuarioId, esAdmin);
}

function finalizarCuadro(t: Torneo, campeon: number, subcampeon: number | null) {
  finalizar(t, [[campeon], subcampeon ? [subcampeon] : []]);
}

// --- Liga y suizo ---

function guardarRonda(torneoId: number, llave: "RR" | "SW", ronda: number, pares: { a: number; b: number | null }[]) {
  const ins = db().prepare(
    `INSERT INTO partidas (torneo_id, llave, ronda, pos, equipo_a, equipo_b, ganador, resultado, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Los descansos van al final de la ronda y cuentan como victoria.
  const orden = [...pares.filter((p) => p.b !== null), ...pares.filter((p) => p.b === null)];
  orden.forEach((p, pos) => {
    const descanso = p.b === null;
    ins.run(torneoId, llave, ronda, pos, p.a, p.b, descanso ? p.a : null, descanso ? "a" : null, descanso ? "bye" : "pendiente");
  });
}

function ultimaPorJugar(torneoId: number) {
  const t = torneo(torneoId)!;
  const quedan = db()
    .prepare("SELECT COUNT(*) AS n FROM partidas WHERE torneo_id = ? AND estado IN ('pendiente', 'en_juego')")
    .get(torneoId) as { n: number };
  const ronda = db().prepare("SELECT MAX(ronda) AS r FROM partidas WHERE torneo_id = ?").get(torneoId) as { r: number };
  return quedan.n === 1 && (t.formato === "liga" || ronda.r >= t.rondas);
}

export function juegosDe(torneoId: number): JuegoPuntos[] {
  return partidasDe(torneoId).map((p) => ({
    ronda: p.ronda,
    a: p.equipo_a!,
    b: p.equipo_b,
    resultado: p.resultado,
  }));
}

export function tablaDe(t: Torneo) {
  return clasificacion(
    equiposDe(t.id).map((e) => e.id),
    juegosDe(t.id),
    t.formato === "liga" ? "liga" : "suizo",
  );
}

// Con la ronda completa: en suizo se empareja la siguiente; si era la última
// (o en liga ya se jugó todo), se reparte el premio por la clasificación.
function avanzarPorPuntos(t: Torneo) {
  const quedan = db()
    .prepare("SELECT COUNT(*) AS n FROM partidas WHERE torneo_id = ? AND estado IN ('pendiente', 'en_juego')")
    .get(t.id) as { n: number };
  if (quedan.n > 0) return;
  const ronda = (db().prepare("SELECT MAX(ronda) AS r FROM partidas WHERE torneo_id = ?").get(t.id) as { r: number }).r;
  if (t.formato === "suizo" && ronda < t.rondas) {
    guardarRonda(t.id, "SW", ronda + 1, rondaSuiza(equiposDe(t.id).map((e) => e.id), juegosDe(t.id)));
    return;
  }
  finalizarPorTabla(t, tablaDe(t).map((f) => ({ equipo: f.jugador, clave: `${f.puntos}|${f.desempate}|${f.ganadas}` })));
}

// Agrupa los empatados: quienes comparten clave comparten puesto.
export function finalizarPorTabla(t: Torneo, orden: { equipo: number; clave: string }[]) {
  const grupos: number[][] = [];
  for (const f of orden) {
    const ultimo = grupos.at(-1);
    if (ultimo && orden.find((x) => x.equipo === ultimo[0])!.clave === f.clave) ultimo.push(f.equipo);
    else grupos.push([f.equipo]);
  }
  finalizar(t, grupos);
}

// Reparte el pozo por puestos: `puestos` son grupos de equipos empatados en
// orden. El premio de cada puesto que ocupe un grupo se suma y se divide entre
// sus equipos, y dentro de cada equipo entre sus integrantes, a partes iguales.
// Los céntimos que no se dividen exacto van a los primeros.
function finalizar(t: Torneo, puestos: number[][]) {
  const premios = t.reparto === "70-30" ? [Math.floor(t.pozo * 0.7), t.pozo - Math.floor(t.pozo * 0.7)] : [t.pozo];
  const equipos = equiposDe(t.id);
  let posicion = 0;
  for (const grupo of puestos) {
    const total = premios.slice(posicion, posicion + grupo.length).reduce((s, x) => s + x, 0);
    const nombrePuesto = posicion === 0 ? "Campeón" : "Subcampeón";
    posicion += grupo.length;
    if (total <= 0) continue;
    const jugadores = grupo.flatMap((id) => equipos.find((e) => e.id === id)?.integrantes ?? []);
    if (jugadores.length === 0) continue;
    const base = Math.floor(total / jugadores.length);
    let resto = total - base * jugadores.length;
    for (const i of jugadores) {
      const monto = base + (resto-- > 0 ? 1 : 0);
      const empate = grupo.length > 1 ? " (empatados)" : "";
      mover(i.usuario_id, monto, "premio", `${nombrePuesto}${empate} de ${t.nombre}`);
    }
    if (posicion >= premios.length) break;
  }
  // Con premio fijo, lo recaudado no entra al premio: se lo lleva el organizador.
  if (!t.suma_recaudado && t.recaudado > 0) {
    mover(t.organizador_id, t.recaudado, "recaudacion", `Recaudación de ${t.nombre} (premio fijo)`);
  }
  const campeon = puestos[0]?.[0] ?? null;
  db().prepare("UPDATE torneos SET estado = 'finalizado', campeon_id = ? WHERE id = ?").run(campeon, t.id);
  // Las apuestas al campeón se resuelven si hay un campeón claro; con empate en
  // el primer puesto se devuelven.
  if (campeon && puestos[0].length === 1) resolverPorEquipo({ torneoCampeon: t.id }, campeon);
  else {
    const abiertas = db()
      .prepare("SELECT id FROM mercados WHERE torneo_id = ? AND partida_id IS NULL AND estado IN ('abierto','cerrado')")
      .all(t.id) as { id: number }[];
    for (const m of abiertas) anularMercado(m.id, "Empate en el primer puesto, se devuelve");
  }
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
    if (t.pozo_pagina > 0) moverAcumulado(t.pozo_pagina, `Vuelve del torneo cancelado ${t.nombre}`, { torneoId });
    db().prepare("UPDATE torneos SET estado = 'cancelado' WHERE id = ?").run(torneoId);
  });
}
