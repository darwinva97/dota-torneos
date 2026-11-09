import "server-only";
import { db, transaccion } from "./db";
import { exigir } from "./errores";
import { soles } from "./dinero";

// Pozo acumulado de la página. No es de ningún jugador: crece con la comisión
// de las apuestas (lo que no se reparte a los ganadores) y el admin lo usa como
// premio en los torneos, entero o en parte, guardando el resto para el
// siguiente. Es dinero real: está en el Yape del pozo como cualquier saldo.

// Cuánto se reparte a los ganadores de una apuesta, en % de lo apostado.
export const OPCIONES_PAGO = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50] as const;

export function pagoApuestas() {
  const fila = db().prepare("SELECT valor FROM config WHERE clave = 'pago_apuestas'").get() as
    | { valor: string }
    | undefined;
  const pct = Number(fila?.valor ?? 100);
  return Number.isInteger(pct) && pct >= 50 && pct <= 100 ? pct : 100;
}

export function fijarPagoApuestas(pct: number) {
  exigir((OPCIONES_PAGO as readonly number[]).includes(pct), "Elige un porcentaje de la lista.");
  db()
    .prepare("INSERT INTO config (clave, valor) VALUES ('pago_apuestas', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor")
    .run(String(pct));
}

export function saldoAcumulado() {
  const fila = db().prepare("SELECT saldo_despues FROM acumulado ORDER BY id DESC LIMIT 1").get() as
    | { saldo_despues: number }
    | undefined;
  return fila?.saldo_despues ?? 0;
}

// Único punto que toca el pozo acumulado. Dentro de una transacción si forma
// parte de algo mayor (better-sqlite3 anida con savepoints).
export function moverAcumulado(monto: number, motivo: string, ref: { mercadoId?: number; torneoId?: number } = {}) {
  if (monto === 0) return;
  transaccion(() => {
    const saldo = saldoAcumulado() + monto;
    exigir(saldo >= 0, `El pozo acumulado tiene ${soles(saldo - monto)} y no alcanza para ${soles(-monto)}.`);
    db()
      .prepare("INSERT INTO acumulado (monto, motivo, mercado_id, torneo_id, saldo_despues) VALUES (?, ?, ?, ?, ?)")
      .run(monto, motivo, ref.mercadoId ?? null, ref.torneoId ?? null, saldo);
  });
}

// El admin pone dinero en el pozo acumulado (por ejemplo, un premio que
// patrocina él o dinero que entró por fuera de Yape). No sale del saldo de
// ningún jugador: queda como un aporte en el historial del pozo.
export function aportarAcumulado(monto: number, motivo: string, admin: string) {
  exigir(monto >= 100, "Aporta al menos S/ 1.00.");
  exigir(motivo.trim().length >= 3, "Escribe el motivo del aporte.");
  moverAcumulado(monto, `Aporte de ${admin}: ${motivo.trim()}`);
}

export type MovimientoAcumulado = {
  id: number;
  monto: number;
  motivo: string;
  mercado_id: number | null;
  torneo_id: number | null;
  saldo_despues: number;
  creado: string;
};

export function historialAcumulado(limite = 50) {
  return db().prepare("SELECT * FROM acumulado ORDER BY id DESC LIMIT ?").all(limite) as MovimientoAcumulado[];
}

export function resumenAcumulado() {
  const suma = (where: string) =>
    (db().prepare(`SELECT COALESCE(SUM(monto), 0) AS s FROM acumulado WHERE ${where}`).get() as { s: number }).s;
  return {
    saldo: saldoAcumulado(),
    /** Comisiones de apuestas recibidas en total. */
    deApuestas: suma("mercado_id IS NOT NULL"),
    /** Puesto en premios de torneos (descontando lo que volvió de torneos cancelados). */
    aTorneos: -suma("mercado_id IS NULL AND torneo_id IS NOT NULL"),
    /** Lo que puso el admin a mano. */
    aportes: suma("mercado_id IS NULL AND torneo_id IS NULL AND monto > 0"),
    pagoApuestas: pagoApuestas(),
  };
}
