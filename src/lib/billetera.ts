import "server-only";
import { db, transaccion } from "./db";
import { ErrorUsuario, exigir } from "./errores";
import { soles } from "./dinero";

export type TipoMovimiento =
  | "recarga"
  | "retiro"
  | "retiro_devuelto"
  | "inscripcion"
  | "inscripcion_devuelta"
  | "garantia"
  | "garantia_devuelta"
  | "premio"
  | "apuesta"
  | "apuesta_ganada"
  | "apuesta_devuelta"
  | "premio_base"
  | "premio_base_devuelto"
  | "recaudacion"
  | "deuda"
  | "cobro_deuda";

// Único punto que toca el saldo. Debe llamarse dentro de una transacción si
// forma parte de una operación mayor (better-sqlite3 anida con savepoints).
export function mover(usuarioId: number, monto: number, tipo: TipoMovimiento, detalle: string) {
  return transaccion(() => {
    const conn = db();
    const fila = conn.prepare("SELECT saldo FROM usuarios WHERE id = ?").get(usuarioId) as
      | { saldo: number }
      | undefined;
    exigir(fila, "Usuario inexistente.");
    const nuevo = fila.saldo + monto;
    if (nuevo < 0) {
      throw new ErrorUsuario(`Saldo insuficiente: tienes ${soles(fila.saldo)} y necesitas ${soles(-monto)}.`);
    }
    conn.prepare("UPDATE usuarios SET saldo = ? WHERE id = ?").run(nuevo, usuarioId);
    conn
      .prepare(
        "INSERT INTO movimientos (usuario_id, monto, tipo, detalle, saldo_despues) VALUES (?, ?, ?, ?, ?)",
      )
      .run(usuarioId, monto, tipo, detalle, nuevo);
    // Retención: si tiene deudas, lo que entra se usa primero para pagarlas.
    if (monto > 0) cobrarDeudas(usuarioId);
  });
}

export type Movimiento = {
  id: number;
  monto: number;
  tipo: TipoMovimiento;
  detalle: string;
  saldo_despues: number;
  creado: string;
};

// Grupos para filtrar el historial. Cada tipo de movimiento cae en uno.
export const GRUPOS = {
  yape: ["recarga", "retiro", "retiro_devuelto"],
  torneos: [
    "inscripcion",
    "inscripcion_devuelta",
    "garantia",
    "garantia_devuelta",
    "premio",
    "premio_base",
    "premio_base_devuelto",
    "recaudacion",
  ],
  apuestas: ["apuesta", "apuesta_ganada", "apuesta_devuelta"],
  deudas: ["deuda", "cobro_deuda"],
} satisfies Record<string, TipoMovimiento[]>;
export type Grupo = keyof typeof GRUPOS;

export function movimientos(usuarioId: number, opciones: { grupo?: Grupo; limite?: number } = {}) {
  const tipos = opciones.grupo ? GRUPOS[opciones.grupo] : null;
  const filtro = tipos ? `AND tipo IN (${tipos.map(() => "?").join(",")})` : "";
  return db()
    .prepare(`SELECT * FROM movimientos WHERE usuario_id = ? ${filtro} ORDER BY id DESC LIMIT ?`)
    .all(usuarioId, ...(tipos ?? []), opciones.limite ?? 200) as Movimiento[];
}

// Totales de la billetera para el resumen de arriba.
export function resumen(usuarioId: number) {
  const suma = (tipos: TipoMovimiento[]) =>
    (
      db()
        .prepare(
          `SELECT COALESCE(SUM(monto), 0) AS s FROM movimientos
           WHERE usuario_id = ? AND tipo IN (${tipos.map(() => "?").join(",")})`,
        )
        .get(usuarioId, ...tipos) as { s: number }
    ).s;
  const apostado = -suma(["apuesta"]);
  const cobradoApuestas = suma(["apuesta_ganada"]);
  const devueltoApuestas = suma(["apuesta_devuelta"]);
  return {
    recargado: suma(["recarga"]),
    retirado: -suma(["retiro", "retiro_devuelto"]),
    premios: suma(["premio"]),
    // Resultado neto de las apuestas: lo cobrado menos lo que se perdió.
    netoApuestas: cobradoApuestas + devueltoApuestas - apostado,
    enRetiro: (
      db()
        .prepare("SELECT COALESCE(SUM(monto), 0) AS s FROM retiros WHERE usuario_id = ? AND estado = 'pendiente'")
        .get(usuarioId) as { s: number }
    ).s,
  };
}

// Libro global para el admin.
export function movimientosGlobales(limite = 100) {
  return db()
    .prepare(
      `SELECT m.*, u.usuario FROM movimientos m JOIN usuarios u ON u.id = m.usuario_id
       ORDER BY m.id DESC LIMIT ?`,
    )
    .all(limite) as (Movimiento & { usuario: string })[];
}

// --- Retiros: el usuario pide, se le descuenta al momento y al admin le llega
// la solicitud. El admin lo yapea y anota el número de operación, o lo rechaza
// con un motivo y se devuelve el saldo. Mientras esté pendiente, el usuario
// puede cancelarlo.

export type EstadoRetiro = "pendiente" | "pagado" | "rechazado" | "cancelado";

export type Retiro = {
  id: number;
  usuario_id: number;
  monto: number;
  destino: string;
  estado: EstadoRetiro;
  operacion: string;
  nota: string;
  creado: string;
  resuelto: string | null;
};

export const RETIRO_MINIMO = 100;

export function pedirRetiro(usuarioId: number, monto: number, destino: string) {
  exigirSinDeudas(usuarioId);
  const celular = destino.replace(/\s/g, "");
  exigir(monto >= RETIRO_MINIMO, `El retiro mínimo es ${soles(RETIRO_MINIMO)}.`);
  exigir(/^9\d{8}$/.test(celular), "Escribe el celular de Yape: 9 dígitos que empiezan por 9.");
  transaccion(() => {
    const pendientes = db()
      .prepare("SELECT COUNT(*) AS n FROM retiros WHERE usuario_id = ? AND estado = 'pendiente'")
      .get(usuarioId) as { n: number };
    exigir(pendientes.n < 3, "Ya tienes 3 retiros pendientes. Espera a que el admin los pague.");
    mover(usuarioId, -monto, "retiro", `Retiro a Yape ${celular}`);
    db().prepare("INSERT INTO retiros (usuario_id, monto, destino) VALUES (?, ?, ?)").run(usuarioId, monto, celular);
  });
}

export function retirosDe(usuarioId: number) {
  return db()
    .prepare("SELECT * FROM retiros WHERE usuario_id = ? ORDER BY id DESC LIMIT 30")
    .all(usuarioId) as Retiro[];
}

export function cancelarRetiro(id: number, usuarioId: number) {
  transaccion(() => {
    const r = db().prepare("SELECT * FROM retiros WHERE id = ?").get(id) as Retiro | undefined;
    exigir(r && r.usuario_id === usuarioId, "Ese retiro no es tuyo.");
    exigir(r.estado === "pendiente", "Ese retiro ya no está pendiente.");
    db().prepare("UPDATE retiros SET estado = 'cancelado', resuelto = datetime('now') WHERE id = ?").run(id);
    mover(usuarioId, r.monto, "retiro_devuelto", "Cancelaste el retiro, vuelve a tu saldo");
  });
}

export function resolverRetiro(id: number, decision: { pagado: true; operacion: string } | { pagado: false; motivo: string }) {
  transaccion(() => {
    const r = db().prepare("SELECT * FROM retiros WHERE id = ?").get(id) as Retiro | undefined;
    exigir(r && r.estado === "pendiente", "Ese retiro ya no está pendiente.");
    if (decision.pagado) {
      db()
        .prepare("UPDATE retiros SET estado = 'pagado', operacion = ?, resuelto = datetime('now') WHERE id = ?")
        .run(decision.operacion.trim(), id);
    } else {
      const motivo = decision.motivo.trim() || "Rechazado por el admin";
      db()
        .prepare("UPDATE retiros SET estado = 'rechazado', nota = ?, resuelto = datetime('now') WHERE id = ?")
        .run(motivo, id);
      mover(r.usuario_id, r.monto, "retiro_devuelto", `Retiro rechazado: ${motivo}`);
    }
  });
}

export function retirosPendientes() {
  return db()
    .prepare(
      `SELECT r.*, u.usuario, u.nombre_yape FROM retiros r JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.estado = 'pendiente' ORDER BY r.id`,
    )
    .all() as (Retiro & { usuario: string; nombre_yape: string })[];
}

export function retirosResueltos(limite = 20) {
  return db()
    .prepare(
      `SELECT r.*, u.usuario FROM retiros r JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.estado != 'pendiente' ORDER BY r.resuelto DESC LIMIT ?`,
    )
    .all(limite) as (Retiro & { usuario: string })[];
}

// Lo que el admin tiene por atender; sale como contador en el menú.
export function solicitudesPendientes() {
  const n = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  return {
    retiros: n("SELECT COUNT(*) AS n FROM retiros WHERE estado = 'pendiente'"),
    recargas: n("SELECT COUNT(*) AS n FROM recargas WHERE estado = 'revision'"),
  };
}

export function resumenUsuarios() {
  return db()
    .prepare("SELECT id, usuario, nombre_yape, saldo, es_admin FROM usuarios ORDER BY saldo DESC")
    .all() as { id: number; usuario: string; nombre_yape: string; saldo: number; es_admin: number }[];
}

// --- Deudas y retenciones ---
// El admin le asigna a un jugador un monto que debe a alguien (al admin, al
// pozo o a otro jugador). Todo lo que le entre después se usa primero para
// pagarla, y mientras deba no puede inscribirse, apostar ni retirar.

export type Deuda = {
  id: number;
  deudor_id: number;
  acreedor_id: number;
  monto: number;
  pagado: number;
  motivo: string;
  estado: "pendiente" | "pagada" | "perdonada";
  creado: string;
  resuelto: string | null;
};

export type DeudaConNombres = Deuda & { deudor: string; acreedor: string };

const SELECT_DEUDA = `
  SELECT d.*, de.usuario AS deudor, ac.usuario AS acreedor FROM deudas d
  JOIN usuarios de ON de.id = d.deudor_id JOIN usuarios ac ON ac.id = d.acreedor_id`;

function cobrarDeudas(usuarioId: number) {
  const pendientes = db()
    .prepare(`${SELECT_DEUDA} WHERE d.deudor_id = ? AND d.estado = 'pendiente' ORDER BY d.id`)
    .all(usuarioId) as DeudaConNombres[];
  for (const d of pendientes) {
    const { saldo } = db().prepare("SELECT saldo FROM usuarios WHERE id = ?").get(usuarioId) as { saldo: number };
    if (saldo <= 0) break;
    const cobro = Math.min(saldo, d.monto - d.pagado);
    const completa = d.pagado + cobro === d.monto;
    // Se marca antes de mover el dinero: abonar al acreedor puede disparar el
    // cobro de sus propias deudas, y esta ya debe constar como cobrada.
    db()
      .prepare(
        `UPDATE deudas SET pagado = pagado + ?, estado = ?, resuelto = CASE WHEN ? THEN datetime('now') END
         WHERE id = ?`,
      )
      .run(cobro, completa ? "pagada" : "pendiente", completa ? 1 : 0, d.id);
    mover(usuarioId, -cobro, "deuda", `Pago de deuda con ${d.acreedor}: ${d.motivo}`);
    mover(d.acreedor_id, cobro, "cobro_deuda", `${d.deudor} te pagó: ${d.motivo}`);
  }
}

export function deudaPendiente(usuarioId: number) {
  return (
    db()
      .prepare(
        "SELECT COALESCE(SUM(monto - pagado), 0) AS n FROM deudas WHERE deudor_id = ? AND estado = 'pendiente'",
      )
      .get(usuarioId) as { n: number }
  ).n;
}

export function exigirSinDeudas(usuarioId: number) {
  const debe = deudaPendiente(usuarioId);
  exigir(
    debe === 0,
    `Tienes una deuda de ${soles(debe)}. Recarga para saldarla: lo que deposites se usa primero para pagarla.`,
  );
}

export function deudasDe(usuarioId: number) {
  return db()
    .prepare(`${SELECT_DEUDA} WHERE d.deudor_id = ? OR d.acreedor_id = ? ORDER BY d.id DESC LIMIT 30`)
    .all(usuarioId, usuarioId) as DeudaConNombres[];
}

export function listarDeudas(estado: "pendiente" | "cerradas") {
  const where = estado === "pendiente" ? "d.estado = 'pendiente'" : "d.estado != 'pendiente'";
  return db()
    .prepare(`${SELECT_DEUDA} WHERE ${where} ORDER BY d.id DESC LIMIT 50`)
    .all() as DeudaConNombres[];
}

export function crearDeuda(d: { deudorId: number; acreedorId: number; monto: number; motivo: string; creadoPor: number }) {
  exigir(d.monto >= 100, "La deuda mínima es S/ 1.00.");
  exigir(d.motivo.trim().length >= 3, "Escribe el motivo, por ejemplo «Debe la entrada del sábado».");
  exigir(d.deudorId !== d.acreedorId, "Nadie se puede deber a sí mismo.");
  transaccion(() => {
    const existen = db()
      .prepare("SELECT COUNT(*) AS n FROM usuarios WHERE id IN (?, ?)")
      .get(d.deudorId, d.acreedorId) as { n: number };
    exigir(existen.n === 2, "Elige al jugador y a quién le debe.");
    db()
      .prepare("INSERT INTO deudas (deudor_id, acreedor_id, monto, motivo, creado_por) VALUES (?, ?, ?, ?, ?)")
      .run(d.deudorId, d.acreedorId, d.monto, d.motivo.trim(), d.creadoPor);
    // Si ya tiene saldo, se retiene al momento.
    cobrarDeudas(d.deudorId);
  });
}

export function perdonarDeuda(id: number) {
  const r = db()
    .prepare("UPDATE deudas SET estado = 'perdonada', resuelto = datetime('now') WHERE id = ? AND estado = 'pendiente'")
    .run(id);
  exigir(r.changes === 1, "Esa deuda ya no está pendiente.");
}
