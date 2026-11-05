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

-- Partidas de cualquier formato. En los cuadros (llave Q descarte, U upper,
-- L lower, GF gran final) cada partida sabe a qué partida y lado van su ganador
-- y su perdedor; lista_a/lista_b dicen si ese lado ya está decidido (un lado
-- decidido y vacío es un pase directo). En liga y suizo (llave RR, SW) no hay
-- cruce: solo resultado, que puede ser tablas.
CREATE TABLE IF NOT EXISTS partidas (
  id INTEGER PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id),
  llave TEXT NOT NULL DEFAULT 'U',
  ronda INTEGER NOT NULL,
  pos INTEGER NOT NULL,
  equipo_a INTEGER REFERENCES equipos(id),
  equipo_b INTEGER REFERENCES equipos(id),
  lista_a INTEGER NOT NULL DEFAULT 1,
  lista_b INTEGER NOT NULL DEFAULT 1,
  ganador INTEGER REFERENCES equipos(id),
  resultado TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  sig_ganador INTEGER,
  lado_ganador TEXT,
  sig_perdedor INTEGER,
  lado_perdedor TEXT,
  UNIQUE (torneo_id, llave, ronda, pos)
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

-- Quién juega por cada equipo en una partida concreta, cuando no son los
-- integrantes inscritos (un cambio o un suplente). Sin filas: juegan los
-- integrantes del equipo.
CREATE TABLE IF NOT EXISTS alineaciones (
  partida_id INTEGER NOT NULL REFERENCES partidas(id),
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  PRIMARY KEY (partida_id, usuario_id)
);

-- Avisos para un jugador (por ejemplo, que le devolvimos una apuesta). Se ven
-- en la campana.
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  enlace TEXT NOT NULL DEFAULT '',
  leido INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS avisos_usuario ON avisos(usuario_id, leido, id);

-- Ajustes de la página que cambia el admin (clave → valor).
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Pozo acumulado de la página: le entra la parte de las apuestas que no se
-- reparte a los ganadores y le sale lo que se pone en el premio de un torneo.
-- monto con signo; el saldo es la suma.
CREATE TABLE IF NOT EXISTS acumulado (
  id INTEGER PRIMARY KEY,
  monto INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  mercado_id INTEGER REFERENCES mercados(id),
  torneo_id INTEGER REFERENCES torneos(id),
  saldo_despues INTEGER NOT NULL CHECK (saldo_despues >= 0),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
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
  // Cola de recargas: cuándo puede empezar su turno (penalización), cuándo
  // terminó y la última vez que su pantalla estaba abierta.
  ["recargas", "disponible_desde", "INTEGER NOT NULL DEFAULT 0"],
  ["recargas", "fin", "INTEGER NOT NULL DEFAULT 0"],
  ["recargas", "visto", "INTEGER NOT NULL DEFAULT 0"],
  // Monto que el usuario dijo que iba a yapear (céntimos; 0 si no lo dijo).
  ["recargas", "monto_esperado", "INTEGER NOT NULL DEFAULT 0"],
  // Modalidad de la apuesta. Las anteriores al parche quedan como «pozo».
  ["mercados", "modalidad", "TEXT NOT NULL DEFAULT 'pozo'"],
  // Juego del torneo y, en ajedrez, el ritmo («blitz 3+2»).
  ["torneos", "juego", "TEXT NOT NULL DEFAULT 'dota2'"],
  ["torneos", "ritmo", "TEXT NOT NULL DEFAULT ''"],
  // Formato del torneo (ver lib/formatos.ts) y sus parámetros.
  ["torneos", "formato", "TEXT NOT NULL DEFAULT 'eliminacion'"],
  ["torneos", "clasifican", "INTEGER NOT NULL DEFAULT 0"],
  ["torneos", "rondas", "INTEGER NOT NULL DEFAULT 0"],
  ["torneos", "duracion", "INTEGER NOT NULL DEFAULT 0"],
  // Torneos jugados en Lichess.
  ["torneos", "lichess_id", "TEXT NOT NULL DEFAULT ''"],
  ["torneos", "lichess_clave", "TEXT NOT NULL DEFAULT ''"],
  ["torneos", "lichess_equipo", "TEXT NOT NULL DEFAULT ''"],
  ["torneos", "lichess_sync", "INTEGER NOT NULL DEFAULT 0"],
  // Cuenta de Lichess conectada por OAuth (el token va cifrado).
  ["usuarios", "lichess_usuario", "TEXT NOT NULL DEFAULT ''"],
  ["usuarios", "lichess_token", "TEXT NOT NULL DEFAULT ''"],
  ["integrantes", "lichess_inscrito", "INTEGER NOT NULL DEFAULT 0"],
  // Porcentaje de lo apostado que se reparte a los ganadores (100 = todo). Se
  // fija al crear la apuesta; el resto, la comisión, va al pozo acumulado.
  ["mercados", "pago_pct", "INTEGER NOT NULL DEFAULT 100"],
  ["mercados", "comision", "INTEGER NOT NULL DEFAULT 0"],
  // Parte del premio del torneo que salió del pozo acumulado de la página.
  ["torneos", "pozo_pagina", "INTEGER NOT NULL DEFAULT 0"],
];

function migrar(db: Database.Database) {
  // Partidas antiguas (solo eliminación directa, sin cruces): se reconstruye la
  // tabla con el esquema nuevo conservando lo que hubiera.
  const columnasPartidas = (db.prepare("PRAGMA table_info(partidas)").all() as { name: string }[]).map((c) => c.name);
  if (!columnasPartidas.includes("llave")) {
    db.pragma("foreign_keys = OFF");
    // Sin legacy_alter_table, SQLite reescribe las claves foráneas de las demás
    // tablas (mercados.partida_id) para que apunten a «partidas_vieja», y al
    // borrarla quedan colgando. Ver repararReferenciasRotas.
    db.pragma("legacy_alter_table = ON");
    db.transaction(() => {
      db.exec("ALTER TABLE partidas RENAME TO partidas_vieja");
      db.exec(ESQUEMA);
      db.exec(`INSERT INTO partidas (id, torneo_id, llave, ronda, pos, equipo_a, equipo_b, ganador, estado)
               SELECT id, torneo_id, 'U', ronda, pos, equipo_a, equipo_b, ganador, estado FROM partidas_vieja`);
      db.exec("DROP TABLE partidas_vieja");
    })();
    db.pragma("legacy_alter_table = OFF");
    db.pragma("foreign_keys = ON");
  }
  repararReferenciasRotas(db);
  for (const [tabla, columna, definicion] of COLUMNAS_NUEVAS) {
    const existe = (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).some(
      (c) => c.name === columna,
    );
    if (!existe) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

// Bases migradas antes del arreglo: mercados.partida_id quedó apuntando a
// «partidas_vieja», que ya no existe, y cualquier INSERT en mercados fallaba con
// «no such table: main.partidas_vieja». Se reconstruye la tabla con la
// referencia correcta (receta de SQLite para cambiar un esquema), conservando
// los datos.
function repararReferenciasRotas(db: Database.Database) {
  const rotas = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql LIKE '%partidas_vieja%'")
    .all() as { name: string; sql: string }[];
  if (!rotas.length) return;
  db.pragma("foreign_keys = OFF");
  db.pragma("legacy_alter_table = ON");
  db.transaction(() => {
    for (const { name, sql } of rotas) {
      const temporal = `${name}__reparada`;
      const nuevo = sql
        .replace(/"?partidas_vieja"?/g, "partidas")
        .replace(new RegExp(`^CREATE TABLE\\s+"?${name}"?`), `CREATE TABLE ${temporal}`);
      db.exec(nuevo);
      db.exec(`INSERT INTO ${temporal} SELECT * FROM ${name}`);
      db.exec(`DROP TABLE ${name}`);
      db.exec(`ALTER TABLE ${temporal} RENAME TO ${name}`);
    }
    const fallos = db.prepare("PRAGMA foreign_key_check").all();
    if (fallos.length) throw new Error(`Claves foráneas rotas tras reparar: ${JSON.stringify(fallos)}`);
  })();
  db.pragma("legacy_alter_table = OFF");
  db.pragma("foreign_keys = ON");
  console.log(`[db] reparadas las referencias a partidas_vieja en: ${rotas.map((r) => r.name).join(", ")}`);
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
