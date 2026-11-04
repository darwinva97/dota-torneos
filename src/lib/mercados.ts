import "server-only";
import { db, transaccion } from "./db";
import { ErrorUsuario, exigir } from "./errores";
import { soles } from "./dinero";
import { exigirSinDeudas, mover } from "./billetera";

// Apuestas aparte de la inscripción. Dos modalidades:
//
//  - «parche» (la de por defecto): dos bandos, y el evento solo puede empezar
//    (cerrar jugadas) o resolverse cuando lo apostado a cada bando es igual.
//    Así quien gana cobra exactamente el doble de lo que puso. Mientras no esté
//    parchada, cada uno puede retirar su apuesta, y quien la gestiona puede
//    devolver lo que sobra del bando que puso de más.
//  - «pozo»: varias opciones; todo va a un pozo común y quienes aciertan se lo
//    reparten en proporción a lo que pusieron.
//
// En ambas no hay casa: no se queda nada.

export type EstadoMercado = "abierto" | "cerrado" | "resuelto" | "anulado";
export type Modalidad = "parche" | "pozo";

export type Mercado = {
  id: number;
  creador_id: number;
  creador: string;
  titulo: string;
  descripcion: string;
  estado: EstadoMercado;
  opcion_ganadora: number | null;
  torneo_id: number | null;
  partida_id: number | null;
  modalidad: Modalidad;
  creado: string;
  pozo: number;
  apostadores: number;
};

export type Opcion = { id: number; etiqueta: string; equipo_id: number | null; total: number; jugadores: number };

export type Jugada = {
  id: number;
  opcion_id: number;
  usuario_id: number;
  usuario: string;
  monto: number;
  pago: number | null;
  creado: string;
};

const SELECT_MERCADO = `
  SELECT m.*, u.usuario AS creador,
    COALESCE((SELECT SUM(monto) FROM jugadas j WHERE j.mercado_id = m.id), 0) AS pozo,
    (SELECT COUNT(DISTINCT usuario_id) FROM jugadas j WHERE j.mercado_id = m.id) AS apostadores
  FROM mercados m JOIN usuarios u ON u.id = m.creador_id`;

export function crearMercado(d: {
  creadorId: number;
  titulo: string;
  descripcion?: string;
  opciones: { etiqueta: string; equipoId?: number }[];
  torneoId?: number;
  partidaId?: number;
  modalidad?: Modalidad;
}) {
  const titulo = d.titulo.trim();
  const modalidad = d.modalidad ?? "parche";
  exigir(titulo.length >= 4, "Escribe sobre qué es la apuesta.");
  const opciones = d.opciones.filter((o) => o.etiqueta.trim());
  exigir(opciones.length >= 2, "Pon al menos dos opciones.");
  exigir(
    new Set(opciones.map((o) => o.etiqueta.trim().toLowerCase())).size === opciones.length,
    "Hay opciones repetidas.",
  );
  exigir(modalidad === "pozo" || opciones.length === 2, "Una apuesta parchada tiene exactamente dos bandos.");
  return transaccion(() => {
    const r = db()
      .prepare(
        "INSERT INTO mercados (creador_id, titulo, descripcion, torneo_id, partida_id, modalidad) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(d.creadorId, titulo, d.descripcion?.trim() ?? "", d.torneoId ?? null, d.partidaId ?? null, modalidad);
    const id = Number(r.lastInsertRowid);
    const ins = db().prepare("INSERT INTO opciones (mercado_id, etiqueta, equipo_id) VALUES (?, ?, ?)");
    for (const o of opciones) ins.run(id, o.etiqueta.trim(), o.equipoId ?? null);
    return id;
  });
}

export function mercado(id: number) {
  return db().prepare(`${SELECT_MERCADO} WHERE m.id = ?`).get(id) as Mercado | undefined;
}

export function listarMercados(filtro: "activos" | "cerrados") {
  const where =
    filtro === "activos" ? "m.estado IN ('abierto', 'cerrado')" : "m.estado IN ('resuelto', 'anulado')";
  return db()
    .prepare(`${SELECT_MERCADO} WHERE ${where} ORDER BY m.id DESC LIMIT 60`)
    .all() as Mercado[];
}

export function mercadosDeTorneo(torneoId: number) {
  return db()
    .prepare(`${SELECT_MERCADO} WHERE m.torneo_id = ? ORDER BY m.id DESC`)
    .all(torneoId) as Mercado[];
}

export function opcionesDe(mercadoId: number) {
  return db()
    .prepare(
      `SELECT o.id, o.etiqueta, o.equipo_id,
         COALESCE(SUM(j.monto), 0) AS total, COUNT(DISTINCT j.usuario_id) AS jugadores
       FROM opciones o LEFT JOIN jugadas j ON j.opcion_id = o.id
       WHERE o.mercado_id = ? GROUP BY o.id ORDER BY o.id`,
    )
    .all(mercadoId) as Opcion[];
}

export function jugadasDe(mercadoId: number) {
  return db()
    .prepare(
      `SELECT j.id, j.opcion_id, j.usuario_id, u.usuario, j.monto, j.pago, j.creado
       FROM jugadas j JOIN usuarios u ON u.id = j.usuario_id
       WHERE j.mercado_id = ? ORDER BY j.id`,
    )
    .all(mercadoId) as Jugada[];
}

export function apostar(usuarioId: number, mercadoId: number, opcionId: number, monto: number) {
  exigir(monto >= 100, "La apuesta mínima es S/ 1.00.");
  exigirSinDeudas(usuarioId);
  transaccion(() => {
    const m = mercado(mercadoId);
    exigir(m, "Esa apuesta no existe.");
    exigir(m.estado === "abierto", "Esta apuesta ya no acepta jugadas.");
    const o = db().prepare("SELECT id FROM opciones WHERE id = ? AND mercado_id = ?").get(opcionId, mercadoId);
    exigir(o, "Elige una de las opciones.");
    // Una sola opción por persona: o vas con una, o con otra.
    const otra = db()
      .prepare("SELECT 1 FROM jugadas WHERE mercado_id = ? AND usuario_id = ? AND opcion_id != ?")
      .get(mercadoId, usuarioId, opcionId);
    exigir(!otra, "Ya apostaste por otra opción en esta apuesta. Solo puedes subir la que ya tienes.");
    mover(usuarioId, -monto, "apuesta", `Apuesta: ${m.titulo}`);
    db()
      .prepare("INSERT INTO jugadas (mercado_id, opcion_id, usuario_id, monto) VALUES (?, ?, ?, ?)")
      .run(mercadoId, opcionId, usuarioId, monto);
  });
}

// --- Parche ---

export type Parche = {
  a: { id: number; etiqueta: string; total: number };
  b: { id: number; etiqueta: string; total: number };
  parchada: boolean;
  /** Lo que le falta al bando que va por debajo para igualar. */
  falta: number;
  /** El bando que va por debajo (null si están iguales). */
  bajo: { id: number; etiqueta: string } | null;
};

export function estadoParche(mercadoId: number): Parche | null {
  const m = db().prepare("SELECT modalidad FROM mercados WHERE id = ?").get(mercadoId) as
    | { modalidad: Modalidad }
    | undefined;
  if (m?.modalidad !== "parche") return null;
  const [a, b] = opcionesDe(mercadoId);
  const falta = Math.abs(a.total - b.total);
  return {
    a: { id: a.id, etiqueta: a.etiqueta, total: a.total },
    b: { id: b.id, etiqueta: b.etiqueta, total: b.total },
    parchada: falta === 0 && a.total > 0,
    falta,
    bajo: falta === 0 ? null : a.total < b.total ? a : b,
  };
}

export function mensajeSinParche(p: Parche, titulo?: string) {
  const cual = titulo ? `«${titulo}» no está parchada` : "La apuesta no está parchada";
  if (p.a.total === 0 && p.b.total === 0) return `${cual}: nadie ha apostado todavía.`;
  return `${cual}: ${p.a.etiqueta} tiene ${soles(p.a.total)} y ${p.b.etiqueta} ${soles(p.b.total)}. Faltan ${soles(p.falta)} por ${p.bajo!.etiqueta}, o devuelve lo que sobra.`;
}

function exigirParchada(mercadoId: number, titulo?: string) {
  const p = estadoParche(mercadoId);
  if (p && !p.parchada) throw new ErrorUsuario(mensajeSinParche(p, titulo));
}

// Mientras la apuesta está abierta, cada uno puede retirar lo que apostó.
export function retirarApuesta(usuarioId: number, mercadoId: number) {
  transaccion(() => {
    const m = mercado(mercadoId);
    exigir(m, "Esa apuesta no existe.");
    exigir(m.estado === "abierto", "Ya no se puede retirar: la apuesta está cerrada.");
    const mias = jugadasDe(mercadoId).filter((j) => j.usuario_id === usuarioId);
    exigir(mias.length > 0, "No tienes nada apostado aquí.");
    const total = mias.reduce((s, j) => s + j.monto, 0);
    db().prepare("DELETE FROM jugadas WHERE mercado_id = ? AND usuario_id = ?").run(mercadoId, usuarioId);
    mover(usuarioId, total, "apuesta_devuelta", `Retiraste tu apuesta: ${m.titulo}`);
  });
}

// Devuelve lo que sobra del bando que puso de más, empezando por las últimas
// jugadas, hasta que los dos bandos queden iguales. Si un bando está vacío, se
// devuelve todo y la apuesta queda anulada.
export function devolverNoParchado(mercadoId: number) {
  transaccion(() => {
    const m = mercado(mercadoId);
    exigir(m && (m.estado === "abierto" || m.estado === "cerrado"), "Esta apuesta ya está cerrada del todo.");
    const p = estadoParche(mercadoId);
    exigir(p, "Solo las apuestas parchadas se igualan.");
    if (p.falta === 0) return;
    if (Math.min(p.a.total, p.b.total) === 0) {
      anularMercado(mercadoId, "Nadie apostó al otro bando, se devuelve");
      return;
    }
    const alto = p.a.total > p.b.total ? p.a : p.b;
    let exceso = p.falta;
    const jugadas = jugadasDe(mercadoId)
      .filter((j) => j.opcion_id === alto.id)
      .reverse();
    for (const j of jugadas) {
      if (exceso === 0) break;
      const devuelto = Math.min(j.monto, exceso);
      exceso -= devuelto;
      if (devuelto === j.monto) db().prepare("DELETE FROM jugadas WHERE id = ?").run(j.id);
      else db().prepare("UPDATE jugadas SET monto = monto - ? WHERE id = ?").run(devuelto, j.id);
      mover(j.usuario_id, devuelto, "apuesta_devuelta", `No se parchó, se devuelve: ${m.titulo}`);
    }
  });
}

// Comprueba que todas las apuestas parchadas ligadas a una partida (y, si es
// la final, las del campeón) estén iguales antes de empezarla o resolverla.
export function exigirParchadasDePartida(partidaId: number, torneoCampeon?: number) {
  const ligadas = db()
    .prepare(
      `SELECT id, titulo FROM mercados WHERE estado IN ('abierto', 'cerrado') AND modalidad = 'parche'
       AND (partida_id = ? OR (? IS NOT NULL AND torneo_id = ? AND partida_id IS NULL))`,
    )
    .all(partidaId, torneoCampeon ?? null, torneoCampeon ?? null) as { id: number; titulo: string }[];
  for (const m of ligadas) {
    // Una apuesta sin jugadas no bloquea: se anula al resolver.
    const p = estadoParche(m.id)!;
    if (p.a.total === 0 && p.b.total === 0) continue;
    exigirParchada(m.id, m.titulo);
  }
}

export function cerrarMercado(mercadoId: number) {
  exigirParchada(mercadoId);
  db().prepare("UPDATE mercados SET estado = 'cerrado' WHERE id = ? AND estado = 'abierto'").run(mercadoId);
}

export function empatar(mercadoId: number) {
  anularMercado(mercadoId, "Empate, se devuelve");
}

export function anularMercado(mercadoId: number, motivo = "Apuesta anulada") {
  transaccion(() => {
    const m = mercado(mercadoId);
    exigir(m && (m.estado === "abierto" || m.estado === "cerrado"), "Esta apuesta ya está cerrada del todo.");
    for (const j of jugadasDe(mercadoId)) {
      mover(j.usuario_id, j.monto, "apuesta_devuelta", `${motivo}: ${m.titulo}`);
      db().prepare("UPDATE jugadas SET pago = ? WHERE id = ?").run(j.monto, j.id);
    }
    db()
      .prepare("UPDATE mercados SET estado = 'anulado', resuelto = datetime('now') WHERE id = ?")
      .run(mercadoId);
  });
}

// Reparto parimutuel. Si nadie acertó, se devuelve todo a todos.
export function resolverMercado(mercadoId: number, opcionId: number) {
  transaccion(() => {
    const m = mercado(mercadoId);
    exigir(m && (m.estado === "abierto" || m.estado === "cerrado"), "Esta apuesta ya está cerrada del todo.");
    const opcion = db()
      .prepare("SELECT etiqueta FROM opciones WHERE id = ? AND mercado_id = ?")
      .get(opcionId, mercadoId) as { etiqueta: string } | undefined;
    exigir(opcion, "Elige la opción ganadora.");

    const jugadas = jugadasDe(mercadoId);
    const ganadoras = jugadas.filter((j) => j.opcion_id === opcionId);
    if (ganadoras.length === 0) {
      anularMercado(mercadoId, "Nadie acertó, se devuelve");
      db().prepare("UPDATE mercados SET opcion_ganadora = ? WHERE id = ?").run(opcionId, mercadoId);
      return;
    }
    exigirParchada(mercadoId);

    const pozo = jugadas.reduce((s, j) => s + j.monto, 0);
    const acertado = ganadoras.reduce((s, j) => s + j.monto, 0);
    const pagos = ganadoras.map((j) => Math.floor((j.monto * pozo) / acertado));
    // Los céntimos que sobran del redondeo van a las jugadas más grandes.
    let resto = pozo - pagos.reduce((s, p) => s + p, 0);
    const orden = ganadoras.map((_, i) => i).sort((a, b) => ganadoras[b].monto - ganadoras[a].monto);
    for (let k = 0; resto > 0; k = (k + 1) % orden.length, resto--) pagos[orden[k]]++;

    const marcar = db().prepare("UPDATE jugadas SET pago = ? WHERE id = ?");
    for (const j of jugadas) marcar.run(0, j.id);
    ganadoras.forEach((j, i) => {
      marcar.run(pagos[i], j.id);
      mover(j.usuario_id, pagos[i], "apuesta_ganada", `Ganaste: ${m.titulo} (${opcion.etiqueta})`);
    });
    db()
      .prepare(
        "UPDATE mercados SET estado = 'resuelto', opcion_ganadora = ?, resuelto = datetime('now') WHERE id = ?",
      )
      .run(opcionId, mercadoId);
  });
}

// Llamado desde los torneos: resuelve sola cualquier apuesta ligada a una
// partida (o al campeón) usando el equipo ganador.
export function resolverPorEquipo(filtro: { partidaId: number } | { torneoCampeon: number }, equipoId: number) {
  const pendientes =
    "partidaId" in filtro
      ? db()
          .prepare("SELECT id FROM mercados WHERE partida_id = ? AND estado IN ('abierto','cerrado')")
          .all(filtro.partidaId)
      : db()
          .prepare(
            "SELECT id FROM mercados WHERE torneo_id = ? AND partida_id IS NULL AND estado IN ('abierto','cerrado')",
          )
          .all(filtro.torneoCampeon);
  for (const { id } of pendientes as { id: number }[]) {
    const o = db()
      .prepare("SELECT id FROM opciones WHERE mercado_id = ? AND equipo_id = ?")
      .get(id, equipoId) as { id: number } | undefined;
    if (o) resolverMercado(id, o.id);
    else anularMercado(id, "El ganador no estaba entre las opciones");
  }
}

// Tablas en una partida de liga o suizo: sus apuestas se devuelven.
export function empatarPorPartida(partidaId: number) {
  const ligadas = db()
    .prepare("SELECT id FROM mercados WHERE partida_id = ? AND estado IN ('abierto','cerrado')")
    .all(partidaId) as { id: number }[];
  for (const m of ligadas) anularMercado(m.id, "Tablas, se devuelve");
}

export function cerrarPorPartida(partidaId: number) {
  exigirParchadasDePartida(partidaId);
  db()
    .prepare("UPDATE mercados SET estado = 'cerrado' WHERE partida_id = ? AND estado = 'abierto'")
    .run(partidaId);
}
