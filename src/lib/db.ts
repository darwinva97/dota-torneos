import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Una sola base SQLite en data/. Todo el dinero va en céntimos (enteros) para no
// arrastrar errores de coma flotante: S/ 12.50 se guarda como 1250.
const DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  nombre_yape TEXT NOT NULL,
  nick_dota TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL,
  es_admin INTEGER NOT NULL DEFAULT 0,
  saldo INTEGER NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira INTEGER NOT NULL
);

-- Libro mayor: cada cambio de saldo deja una fila. monto es con signo.
CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  monto INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  detalle TEXT NOT NULL,
  saldo_despues INTEGER NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS movimientos_usuario ON movimientos(usuario_id, id);

CREATE TABLE IF NOT EXISTS torneos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  entrada INTEGER NOT NULL,
  tam_equipo INTEGER NOT NULL,
  max_equipos INTEGER NOT NULL,
  reparto TEXT NOT NULL DEFAULT 'ganador',
  estado TEXT NOT NULL DEFAULT 'inscripciones',
  organizador_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha TEXT NOT NULL DEFAULT '',
  campeon_id INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipos (
  id INTEGER PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id),
  nombre TEXT NOT NULL,
  capitan_id INTEGER NOT NULL REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (torneo_id, nombre)
);

-- aporte = lo que el jugador puso de entrada; la suma de aportes es el pozo.
CREATE TABLE IF NOT EXISTS integrantes (
  torneo_id INTEGER NOT NULL REFERENCES torneos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  aporte INTEGER NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (torneo_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS partidas (
  id INTEGER PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id),
  ronda INTEGER NOT NULL,
  pos INTEGER NOT NULL,
  equipo_a INTEGER REFERENCES equipos(id),
  equipo_b INTEGER REFERENCES equipos(id),
  ganador INTEGER REFERENCES equipos(id),
  estado TEXT NOT NULL DEFAULT 'pendiente',
  UNIQUE (torneo_id, ronda, pos)
);

-- Apuestas aparte, de pozo común (parimutuel): quien acierta se reparte todo
-- lo apostado en proporción a lo que puso.
CREATE TABLE IF NOT EXISTS mercados (
  id INTEGER PRIMARY KEY,
  creador_id INTEGER NOT NULL REFERENCES usuarios(id),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'abierto',
  opcion_ganadora INTEGER,
  torneo_id INTEGER REFERENCES torneos(id),
  partida_id INTEGER REFERENCES partidas(id),
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto TEXT
);

CREATE TABLE IF NOT EXISTS opciones (
  id INTEGER PRIMARY KEY,
  mercado_id INTEGER NOT NULL REFERENCES mercados(id),
  etiqueta TEXT NOT NULL,
  equipo_id INTEGER REFERENCES equipos(id)
);

CREATE TABLE IF NOT EXISTS jugadas (
  id INTEGER PRIMARY KEY,
  mercado_id INTEGER NOT NULL REFERENCES mercados(id),
  opcion_id INTEGER NOT NULL REFERENCES opciones(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  monto INTEGER NOT NULL,
  pago INTEGER,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pagos que reporta el observador de Yape (la app del celular o la API).
CREATE TABLE IF NOT EXISTS pagos_yape (
  id INTEGER PRIMARY KEY,
  externo_id TEXT NOT NULL UNIQUE,
  monto INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  recibido INTEGER NOT NULL,
  fuente TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'libre',
  recarga_id INTEGER,
  crudo TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Una recarga es una ventana de escucha: empieza al pulsar el botón y espera
-- a que el observador vea entrar un Yape a nombre del usuario.
CREATE TABLE IF NOT EXISTS recargas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  estado TEXT NOT NULL DEFAULT 'escuchando',
  comprobante TEXT,
  pago_id INTEGER REFERENCES pagos_yape(id),
  monto INTEGER,
  inicio INTEGER NOT NULL,
  expira INTEGER NOT NULL,
  nota TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Deudas o montos a retener que el admin asigna a un jugador. Todo lo que le
-- entra se usa primero para pagarlas, y lo cobrado pasa al acreedor.
CREATE TABLE IF NOT EXISTS deudas (
  id INTEGER PRIMARY KEY,
  deudor_id INTEGER NOT NULL REFERENCES usuarios(id),
  acreedor_id INTEGER NOT NULL REFERENCES usuarios(id),
  monto INTEGER NOT NULL CHECK (monto > 0),
  pagado INTEGER NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto TEXT
);

CREATE TABLE IF NOT EXISTS retiros (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  monto INTEGER NOT NULL,
  destino TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto TEXT
);
`;

function abrir() {
  fs.mkdirSync(path.join(DIR, "comprobantes"), { recursive: true });
  const db = new Database(path.join(DIR, "pozo.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(ESQUEMA);
  migrar(db);
  return db;
}

// Columnas añadidas después de la primera versión. SQLite no tiene
// «ADD COLUMN IF NOT EXISTS», así que miramos antes qué columnas hay.
const COLUMNAS_NUEVAS: [tabla: string, columna: string, definicion: string][] = [
  // Garantía de puntualidad: parte de la inscripción que se devuelve si el
  // jugador llega a tiempo y va al pozo si falta.
  ["torneos", "garantia", "INTEGER NOT NULL DEFAULT 0"],
  ["torneos", "limite_llegada", "TEXT NOT NULL DEFAULT ''"],
  ["integrantes", "garantia", "INTEGER NOT NULL DEFAULT 0"],
  // NULL = sin marcar, 'a_tiempo' o 'falto'. Lo marca quien organiza.
  ["integrantes", "asistencia", "TEXT"],
  // Garantía que este jugador perdió y pasó al pozo.
  ["integrantes", "garantia_pozo", "INTEGER NOT NULL DEFAULT 0"],
  // Retiros: el admin anota el número de operación de Yape al pagar, o el
  // motivo al rechazar.
  ["retiros", "operacion", "TEXT NOT NULL DEFAULT ''"],
  ["retiros", "nota", "TEXT NOT NULL DEFAULT ''"],
  // Premio base que pone el organizador de su saldo, y si lo recaudado
  // (inscripciones y garantías perdidas) se suma al premio o va al organizador.
  ["torneos", "premio_base", "INTEGER NOT NULL DEFAULT 0"],
  ["torneos", "suma_recaudado", "INTEGER NOT NULL DEFAULT 1"],
];

function migrar(db: Database.Database) {
  for (const [tabla, columna, definicion] of COLUMNAS_NUEVAS) {
    const existe = (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).some(
      (c) => c.name === columna,
    );
    if (!existe) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

// En desarrollo los módulos se recargan; guardamos la conexión en globalThis
// para no abrir una nueva en cada cambio.
const g = globalThis as unknown as { __pozoDb?: Database.Database };

export function db() {
  g.__pozoDb ??= abrir();
  return g.__pozoDb;
}

export const DIR_COMPROBANTES = path.join(DIR, "comprobantes");

export function transaccion<T>(fn: () => T): T {
  return db().transaction(fn)();
}
