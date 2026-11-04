import "server-only";
import { db, transaccion } from "../db";
import { exigir } from "../errores";
import { mover } from "../billetera";
import { soles } from "../dinero";
import { emitir } from "./bus";

// Flujo de recarga:
//  1. El usuario pulsa «Recargar»: se abre una recarga en estado «escuchando».
//  2. Tiene 3 minutos para yapear al número del pozo; sube la captura (queda
//     como comprobante). Solo cuentan los Yapes que llegan después de pulsar.
//  3. El observador (la app del celular que lee las notificaciones de Yape, o
//     la API que la expone) reporta cada pago con monto y nombre → ingresarPago.
//  4. Si el nombre del pago coincide con el nombre de Yape de exactamente un
//     usuario que está escuchando, se acredita solo. Si no, el usuario puede
//     decir «es mío» y un admin lo confirma mirando la captura.

export const VENTANA_MS = 3 * 60 * 1000;
// Un Yape hecho en el segundo 2:59 tarda unos segundos en notificarse y en
// pasar por yapi; lo aceptamos si llega dentro de esta gracia tras el plazo.
const GRACIA_MS = 30 * 1000;

export type EstadoRecarga = "escuchando" | "acreditada" | "revision" | "vencida" | "cancelada";

export type Recarga = {
  id: number;
  usuario_id: number;
  estado: EstadoRecarga;
  comprobante: string | null;
  pago_id: number | null;
  monto: number | null;
  inicio: number;
  expira: number;
  nota: string;
  creado: string;
};

export type PagoYape = {
  id: number;
  externo_id: string;
  monto: number;
  nombre: string;
  recibido: number;
  fuente: string;
  estado: "libre" | "acreditado" | "descartado";
  recarga_id: number | null;
  creado: string;
};

// --- Comparación de nombres ---

// Palabra del nombre. `prefijo` indica que Yape la recortó: «R.» (inicial) o
// «Con*» (desde noviembre de 2026 Yape oculta el resto del apellido con un *).
type Palabra = { texto: string; prefijo: boolean };

function palabras(nombre: string): Palabra[] {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .map((w) => ({ texto: w.replace(/[^A-Z]/g, ""), prefijo: /[*.]$/.test(w) }))
    .filter((w) => w.texto);
}

// Damos por buena la coincidencia si el primer nombre es igual y al menos otra
// palabra aparece en el nombre registrado, entera o como comienzo si Yape la
// recortó: «Juan C. Perez R.», «Alain Con*», «DARWIN STALIN VILCACHAGUA».
export function nombreCoincide(registrado: string, delPago: string) {
  const a = palabras(registrado).map((w) => w.texto);
  const b = palabras(delPago);
  if (a.length === 0 || b.length === 0) return false;
  const primero = b[0].texto;
  if (!a.includes(primero)) return false;
  if (b.length === 1) return a.length === 1;
  return b
    .slice(1)
    .some((t) =>
      a.some((x) => x !== primero && (x === t.texto || ((t.prefijo || t.texto.length === 1) && x.startsWith(t.texto)))),
    );
}

// --- Lectura ---

export function recarga(id: number) {
  vencerViejas();
  return db().prepare("SELECT * FROM recargas WHERE id = ?").get(id) as Recarga | undefined;
}

export function recargaAbiertaDe(usuarioId: number) {
  vencerViejas();
  return db()
    .prepare("SELECT * FROM recargas WHERE usuario_id = ? AND estado = 'escuchando' ORDER BY id DESC LIMIT 1")
    .get(usuarioId) as Recarga | undefined;
}

export function recargasDe(usuarioId: number) {
  vencerViejas();
  return db()
    .prepare("SELECT * FROM recargas WHERE usuario_id = ? ORDER BY id DESC LIMIT 10")
    .all(usuarioId) as Recarga[];
}

// Pagos sin dueño que llegaron dentro de la ventana de una recarga.
export function pagosLibresDeVentana(r: Recarga) {
  return db()
    .prepare(
      "SELECT * FROM pagos_yape WHERE estado = 'libre' AND recibido BETWEEN ? AND ? ORDER BY recibido DESC LIMIT 10",
    )
    .all(r.inicio, r.expira + GRACIA_MS) as PagoYape[];
}

// Pagos sin dueño recientes, para enseñarlos a quien está escuchando.
export function pagosLibresRecientes(desde: number) {
  return db()
    .prepare("SELECT * FROM pagos_yape WHERE estado = 'libre' AND recibido >= ? ORDER BY recibido DESC LIMIT 10")
    .all(desde) as PagoYape[];
}

function vencerViejas() {
  db()
    .prepare("UPDATE recargas SET estado = 'vencida' WHERE estado = 'escuchando' AND expira < ?")
    .run(Date.now() - GRACIA_MS);
}

function avisar(r: Recarga) {
  emitir({ tipo: "recarga", recargaId: r.id, estado: r.estado, monto: r.monto, nota: r.nota });
}

// --- Acciones del usuario ---

export function abrirRecarga(usuarioId: number) {
  const abierta = recargaAbiertaDe(usuarioId);
  if (abierta) return abierta.id;
  const ahora = Date.now();
  const r = db()
    .prepare("INSERT INTO recargas (usuario_id, inicio, expira) VALUES (?, ?, ?)")
    .run(usuarioId, ahora, ahora + VENTANA_MS);
  return Number(r.lastInsertRowid);
}

export function guardarComprobante(recargaId: number, usuarioId: number, fichero: string) {
  const r = recarga(recargaId);
  exigir(r && r.usuario_id === usuarioId, "Esa recarga no es tuya.");
  db().prepare("UPDATE recargas SET comprobante = ? WHERE id = ?").run(fichero, recargaId);
}

export function cancelarRecarga(recargaId: number, usuarioId: number) {
  db()
    .prepare("UPDATE recargas SET estado = 'cancelada' WHERE id = ? AND usuario_id = ? AND estado = 'escuchando'")
    .run(recargaId, usuarioId);
}

// El usuario dice que un pago detectado es suyo aunque el nombre no cuadre.
export function reclamarPago(recargaId: number, usuarioId: number, pagoId: number) {
  transaccion(() => {
    const r = recarga(recargaId);
    exigir(r && r.usuario_id === usuarioId, "Esa recarga no es tuya.");
    // También vale con la recarga vencida: el Yape pudo llegar a tiempo y no
    // reconocerse solo, y el plazo se acabó mientras subía la captura.
    exigir(r.estado === "escuchando" || r.estado === "vencida", "Esta recarga ya no está activa.");
    exigir(r.comprobante, "Sube primero la captura de tu Yape: el admin la necesita para confirmarlo.");
    const p = db().prepare("SELECT * FROM pagos_yape WHERE id = ?").get(pagoId) as PagoYape | undefined;
    exigir(p && p.estado === "libre", "Ese pago ya fue asignado.");
    exigir(p.recibido >= r.inicio, "Ese Yape llegó antes de que empezaras la recarga.");
    exigir(p.recibido <= r.expira + GRACIA_MS, "Ese Yape llegó después de los 3 minutos de la recarga.");
    db()
      .prepare("UPDATE recargas SET estado = 'revision', pago_id = ?, monto = ?, nota = ? WHERE id = ?")
      .run(pagoId, p.monto, `Reclamado: Yape de ${p.nombre}`, recargaId);
    avisar(recarga(recargaId)!);
  });
}

// --- Entrada de pagos desde el observador ---

export type PagoEntrante = {
  externoId: string;
  monto: number; // céntimos
  nombre: string;
  recibido: number; // ms epoch
  fuente: string;
  crudo?: unknown;
};

export function ingresarPago(p: PagoEntrante) {
  exigir(p.externoId && p.monto > 0 && p.nombre.trim(), "Pago incompleto: falta id, monto o nombre.");
  const r = db()
    .prepare(
      `INSERT OR IGNORE INTO pagos_yape (externo_id, monto, nombre, recibido, fuente, crudo)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(p.externoId, p.monto, p.nombre.trim(), p.recibido, p.fuente, JSON.stringify(p.crudo ?? null));
  if (r.changes === 0) return { nuevo: false as const };
  const pago = db().prepare("SELECT * FROM pagos_yape WHERE id = ?").get(r.lastInsertRowid) as PagoYape;
  emitir({ tipo: "pago", pago: { id: pago.id, monto: pago.monto, nombre: pago.nombre, recibido: pago.recibido } });
  const recargaId = intentarEmparejar(pago);
  return { nuevo: true as const, pagoId: pago.id, recargaId };
}

function intentarEmparejar(pago: PagoYape): number | null {
  vencerViejas();
  const candidatas = db()
    .prepare(
      `SELECT r.*, u.nombre_yape FROM recargas r JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.estado = 'escuchando' AND r.inicio <= ? AND r.expira + ? >= ?`,
    )
    .all(pago.recibido, GRACIA_MS, pago.recibido) as (Recarga & { nombre_yape: string })[];
  const coinciden = candidatas.filter((c) => nombreCoincide(c.nombre_yape, pago.nombre));
  // Con dos candidatos del mismo nombre no adivinamos: que lo vea el admin.
  if (coinciden.length !== 1) return null;
  acreditar(coinciden[0].id, pago.id);
  return coinciden[0].id;
}

export function acreditar(recargaId: number, pagoId: number) {
  transaccion(() => {
    const r = db().prepare("SELECT * FROM recargas WHERE id = ?").get(recargaId) as Recarga | undefined;
    const p = db().prepare("SELECT * FROM pagos_yape WHERE id = ?").get(pagoId) as PagoYape | undefined;
    exigir(r && (r.estado === "escuchando" || r.estado === "revision" || r.estado === "vencida"), "Esa recarga ya se cerró.");
    exigir(p && p.estado === "libre", "Ese pago ya se usó.");
    db().prepare("UPDATE pagos_yape SET estado = 'acreditado', recarga_id = ? WHERE id = ?").run(recargaId, pagoId);
    db()
      .prepare("UPDATE recargas SET estado = 'acreditada', pago_id = ?, monto = ?, nota = ? WHERE id = ?")
      .run(pagoId, p.monto, `Yape de ${p.nombre}`, recargaId);
    mover(r.usuario_id, p.monto, "recarga", `Recarga por Yape (${p.nombre}, ${soles(p.monto)})`);
    avisar(db().prepare("SELECT * FROM recargas WHERE id = ?").get(recargaId) as Recarga);
  });
}

// --- Admin ---

export function recargasEnRevision() {
  return db()
    .prepare(
      `SELECT r.*, u.usuario, u.nombre_yape, p.nombre AS pago_nombre, p.monto AS pago_monto, p.estado AS pago_estado
       FROM recargas r JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN pagos_yape p ON p.id = r.pago_id
       WHERE r.estado = 'revision' ORDER BY r.id`,
    )
    .all() as (Recarga & {
    usuario: string;
    nombre_yape: string;
    pago_nombre: string | null;
    pago_monto: number | null;
    pago_estado: string | null;
  })[];
}

export function rechazarRecarga(recargaId: number, nota: string) {
  db()
    .prepare("UPDATE recargas SET estado = 'cancelada', nota = ? WHERE id = ? AND estado = 'revision'")
    .run(nota || "Rechazada por el admin", recargaId);
  const r = recarga(recargaId);
  if (r) avisar(r);
}

export function ultimosPagos() {
  return db()
    .prepare(
      `SELECT p.*, u.usuario FROM pagos_yape p
       LEFT JOIN recargas r ON r.id = p.recarga_id LEFT JOIN usuarios u ON u.id = r.usuario_id
       ORDER BY p.recibido DESC LIMIT 40`,
    )
    .all() as (PagoYape & { usuario: string | null })[];
}
