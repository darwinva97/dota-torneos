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
  | "apuesta_devuelta";

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
    return nuevo;
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
  torneos: ["inscripcion", "inscripcion_devuelta", "garantia", "garantia_devuelta", "premio"],
  apuestas: ["apuesta", "apuesta_ganada", "apuesta_devuelta"],
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
