import "server-only";
import { db, transaccion } from "./db";
import { exigir } from "./errores";
import { exigirSinDeudas, mover } from "./billetera";

// Apuestas aparte de la inscripción. Cada mercado es una pregunta con varias
// opciones; todo lo apostado va a un pozo común y quienes aciertan se lo
// reparten en proporción a lo que pusieron. No hay casa: no se queda nada.

export type EstadoMercado = "abierto" | "cerrado" | "resuelto" | "anulado";

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
}) {
  const titulo = d.titulo.trim();
  exigir(titulo.length >= 4, "Escribe sobre qué es la apuesta.");
  const opciones = d.opciones.filter((o) => o.etiqueta.trim());
  exigir(opciones.length >= 2, "Pon al menos dos opciones.");
  exigir(
    new Set(opciones.map((o) => o.etiqueta.trim().toLowerCase())).size === opciones.length,
    "Hay opciones repetidas.",
  );
  return transaccion(() => {
    const r = db()
      .prepare(
        "INSERT INTO mercados (creador_id, titulo, descripcion, torneo_id, partida_id) VALUES (?, ?, ?, ?, ?)",
      )
      .run(d.creadorId, titulo, d.descripcion?.trim() ?? "", d.torneoId ?? null, d.partidaId ?? null);
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

export function cerrarMercado(mercadoId: number) {
  db().prepare("UPDATE mercados SET estado = 'cerrado' WHERE id = ? AND estado = 'abierto'").run(mercadoId);
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

export function cerrarPorPartida(partidaId: number) {
  db()
    .prepare("UPDATE mercados SET estado = 'cerrado' WHERE partida_id = ? AND estado = 'abierto'")
    .run(partidaId);
}
