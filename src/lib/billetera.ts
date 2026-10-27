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

export function movimientos(usuarioId: number, limite = 50) {
  return db()
    .prepare("SELECT * FROM movimientos WHERE usuario_id = ? ORDER BY id DESC LIMIT ?")
    .all(usuarioId, limite) as Movimiento[];
}

// --- Retiros: se descuenta al pedirlo y el admin lo paga por Yape a mano ---

export type Retiro = {
  id: number;
  usuario_id: number;
  monto: number;
  destino: string;
  estado: "pendiente" | "pagado" | "rechazado";
  creado: string;
};

export function pedirRetiro(usuarioId: number, monto: number, destino: string) {
  exigir(monto >= 100, "El retiro mínimo es S/ 1.00.");
  exigir(/^9\d{8}$/.test(destino.replace(/\s/g, "")), "Escribe el celular de Yape: 9 dígitos que empiezan por 9.");
  transaccion(() => {
    mover(usuarioId, -monto, "retiro", `Retiro a Yape ${destino}`);
    db()
      .prepare("INSERT INTO retiros (usuario_id, monto, destino) VALUES (?, ?, ?)")
      .run(usuarioId, monto, destino.replace(/\s/g, ""));
  });
}

export function retirosDe(usuarioId: number) {
  return db()
    .prepare("SELECT * FROM retiros WHERE usuario_id = ? ORDER BY id DESC LIMIT 20")
    .all(usuarioId) as Retiro[];
}

export function resolverRetiro(id: number, pagado: boolean) {
  transaccion(() => {
    const r = db().prepare("SELECT * FROM retiros WHERE id = ?").get(id) as Retiro | undefined;
    exigir(r && r.estado === "pendiente", "Ese retiro ya no está pendiente.");
    db()
      .prepare("UPDATE retiros SET estado = ?, resuelto = datetime('now') WHERE id = ?")
      .run(pagado ? "pagado" : "rechazado", id);
    if (!pagado) mover(r.usuario_id, r.monto, "retiro_devuelto", "Retiro rechazado, se devuelve el saldo");
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

export function resumenUsuarios() {
  return db()
    .prepare("SELECT id, usuario, nombre_yape, saldo, es_admin FROM usuarios ORDER BY saldo DESC")
    .all() as { id: number; usuario: string; nombre_yape: string; saldo: number; es_admin: number }[];
}
