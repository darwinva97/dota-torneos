import "server-only";
import { db, transaccion } from "../db";
import { exigir } from "../errores";
import { mover } from "../billetera";
import { soles } from "../dinero";
import { emitir } from "./bus";

// Flujo de recarga, con un solo turno a la vez:
//  1. El usuario pulsa «Recargar» y entra en la cola («en_cola»).
//  2. Cuando nadie más tiene el turno, empieza el suyo («escuchando»): 30
//     segundos en los que es el único que puede recargar. Así cualquier Yape que
//     llegue en ese rato es casi seguro suyo.
//  3. El observador (yapi, que lee las notificaciones de Yape en el celular del
//     pozo) reporta cada pago con monto y nombre → ingresarPago.
//  4. Se acredita solo si llega por el monto exacto que dijo que iba a yapear
//     (ver elegirCandidata). Si no, el usuario puede decir «es mío» y un admin
//     lo confirma.
//  5. El turno termina al acreditarse, al reclamar, al cancelar o al vencer, y
//     empieza el del siguiente en la cola.
//
// Penalización: si a alguien se le venció el turno sin yapear (o lo canceló) y
// vuelve a intentarlo en los 10 minutos siguientes, su turno no puede empezar
// hasta pasado 1 minuto. Si en ese minuto llega otra persona, va primero.

export const TURNO_MS = 30 * 1000;
// Un Yape hecho en el último segundo tarda unos segundos en notificarse y en
// pasar por yapi; el turno sigue reservado durante esta gracia tras el plazo.
const GRACIA_MS = 20 * 1000;
export const PENALIZACION_MS = 60 * 1000;
const MEMORIA_FALLOS_MS = 10 * 60 * 1000;
// Quien cierra la pantalla mientras espera en la cola pierde el sitio.
const ABANDONO_COLA_MS = 2 * 60 * 1000;

// Reloj sustituible para las pruebas.
let reloj = () => Date.now();
export function fijarRelojParaPruebas(fn: () => number) {
  reloj = fn;
}

export type EstadoRecarga = "en_cola" | "escuchando" | "acreditada" | "revision" | "vencida" | "cancelada";

export type Recarga = {
  id: number;
  usuario_id: number;
  estado: EstadoRecarga;
  comprobante: string | null;
  pago_id: number | null;
  monto: number | null;
  /** Inicio y fin del turno; 0 mientras espera en la cola. */
  inicio: number;
  expira: number;
  disponible_desde: number;
  fin: number;
  visto: number;
  monto_esperado: number;
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

// Cuántas palabras del nombre del pago aparecen en el nombre registrado, en
// cualquier orden: una palabra entera cuenta 2 y una recortada por Yape
// («R.», «Con*») cuenta 1 si es el comienzo de alguna palabra registrada.
// Cada palabra registrada se usa una sola vez.
export function puntuarNombre(registrado: string, delPago: string) {
  const libres = palabras(registrado).map((w) => w.texto);
  let puntos = 0;
  let enteras = 0;
  // Primero las enteras, para que una recortada no le robe la palabra a una entera.
  const delP = palabras(delPago).sort((x, y) => Number(x.prefijo) - Number(y.prefijo));
  for (const t of delP) {
    const recortada = t.prefijo || t.texto.length === 1;
    const i = libres.findIndex((x) => x === t.texto || (recortada && x.startsWith(t.texto)));
    if (i === -1) continue;
    const entera = libres[i] === t.texto && !recortada;
    puntos += entera ? 2 : 1;
    if (entera) enteras++;
    libres.splice(i, 1);
  }
  return { puntos, enteras };
}

// Coincide si hay al menos una palabra entera y otra más (entera o recortada):
// «Juan C. Perez R.», «Alain Con*», «DARWIN STALIN VILCACHAGUA».
export function nombreCoincide(registrado: string, delPago: string) {
  const { puntos, enteras } = puntuarNombre(registrado, delPago);
  const unaSolaPalabra = palabras(registrado).length === 1 && palabras(delPago).length === 1;
  return enteras >= 1 && (puntos >= 3 || unaSolaPalabra);
}

// --- Lectura ---

export function recarga(id: number) {
  avanzarCola();
  return db().prepare("SELECT * FROM recargas WHERE id = ?").get(id) as Recarga | undefined;
}

export function recargaAbiertaDe(usuarioId: number) {
  avanzarCola();
  return db()
    .prepare(
      "SELECT * FROM recargas WHERE usuario_id = ? AND estado IN ('en_cola', 'escuchando') ORDER BY id DESC LIMIT 1",
    )
    .get(usuarioId) as Recarga | undefined;
}

export function recargasDe(usuarioId: number) {
  avanzarCola();
  return db()
    .prepare("SELECT * FROM recargas WHERE usuario_id = ? ORDER BY id DESC LIMIT 10")
    .all(usuarioId) as Recarga[];
}

// Pagos sin dueño que llegaron dentro del turno de una recarga.
export function pagosLibresDeVentana(r: Recarga) {
  if (!r.inicio) return [];
  return db()
    .prepare(
      "SELECT * FROM pagos_yape WHERE estado = 'libre' AND recibido BETWEEN ? AND ? ORDER BY recibido DESC LIMIT 10",
    )
    .all(r.inicio, r.expira + GRACIA_MS) as PagoYape[];
}

// Lo que ve la pantalla de recarga: su estado, el turno y su sitio en la cola.
export type VistaRecarga = {
  estado: EstadoRecarga;
  monto: number | null;
  /** Lo que dijo que iba a yapear (0 si no lo dijo). */
  montoEsperado: number;
  nota: string;
  inicio: number;
  expira: number;
  /** Personas antes en la cola, contando a quien tiene el turno. */
  delante: number;
  /** Hasta cuándo dura la penalización (0 si no tiene). */
  disponibleDesde: number;
  /** Estimación de cuándo empieza su turno, en el peor caso. */
  empiezaHacia: number;
};

export function vistaRecarga(id: number): VistaRecarga | null {
  const r = recarga(id);
  if (!r) return null;
  let delante = 0;
  let empiezaHacia = 0;
  if (r.estado === "en_cola") {
    const activo = turnoActivo();
    const antes = db()
      .prepare("SELECT COUNT(*) AS n FROM recargas WHERE estado = 'en_cola' AND id < ?")
      .get(r.id) as { n: number };
    delante = antes.n + (activo ? 1 : 0);
    const ahora = reloj();
    const finActivo = activo ? activo.expira + GRACIA_MS : ahora;
    empiezaHacia = Math.max(finActivo + antes.n * (TURNO_MS + GRACIA_MS), r.disponible_desde, ahora);
  }
  return {
    estado: r.estado,
    monto: r.monto,
    montoEsperado: r.monto_esperado,
    nota: r.nota,
    inicio: r.inicio,
    expira: r.expira,
    delante,
    disponibleDesde: r.disponible_desde > reloj() ? r.disponible_desde : 0,
    empiezaHacia,
  };
}

export function colaActual() {
  avanzarCola();
  return db()
    .prepare(
      `SELECT r.id, r.estado, r.expira, r.disponible_desde, r.monto_esperado, u.usuario FROM recargas r
       JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.estado IN ('escuchando', 'en_cola') ORDER BY r.estado = 'en_cola', r.id`,
    )
    .all() as {
    id: number;
    estado: string;
    expira: number;
    disponible_desde: number;
    monto_esperado: number;
    usuario: string;
  }[];
}

function turnoActivo() {
  return db().prepare("SELECT * FROM recargas WHERE estado = 'escuchando' LIMIT 1").get() as Recarga | undefined;
}

function avisar(r: Recarga) {
  emitir({ tipo: "recarga", recargaId: r.id, estado: r.estado, monto: r.monto, nota: r.nota });
}

function porId(id: number) {
  return db().prepare("SELECT * FROM recargas WHERE id = ?").get(id) as Recarga;
}

// Vence el turno que se pasó de tiempo, saca de la cola a quien la abandonó y,
// si el turno está libre, se lo da al siguiente. Se llama en cada lectura y
// cada segundo desde el reloj de la cola (arrancarRelojCola).
export function avanzarCola() {
  transaccion(() => {
    const ahora = reloj();
    const vencidas = db()
      .prepare("SELECT id, expira FROM recargas WHERE estado = 'escuchando' AND expira + ? < ?")
      .all(GRACIA_MS, ahora) as { id: number; expira: number }[];
    for (const { id, expira } of vencidas) {
      // Fin real del turno, no el momento en que se comprobó.
      db().prepare("UPDATE recargas SET estado = 'vencida', fin = ? WHERE id = ?").run(expira + GRACIA_MS, id);
      avisar(porId(id));
    }
    const abandonadas = db()
      .prepare("SELECT id FROM recargas WHERE estado = 'en_cola' AND visto + ? < ?")
      .all(ABANDONO_COLA_MS, ahora) as { id: number }[];
    for (const { id } of abandonadas) {
      db()
        .prepare("UPDATE recargas SET estado = 'cancelada', fin = ?, nota = ? WHERE id = ?")
        .run(ahora, "Saliste de la pantalla mientras esperabas en la cola", id);
      avisar(porId(id));
    }
    if (turnoActivo()) return;
    // El primero que ya puede empezar; quien está penalizado espera aunque
    // haya llegado antes.
    const siguiente = db()
      .prepare("SELECT id FROM recargas WHERE estado = 'en_cola' AND disponible_desde <= ? ORDER BY id LIMIT 1")
      .get(ahora) as { id: number } | undefined;
    if (!siguiente) return;
    db()
      .prepare("UPDATE recargas SET estado = 'escuchando', inicio = ?, expira = ? WHERE id = ?")
      .run(ahora, ahora + TURNO_MS, siguiente.id);
    avisar(porId(siguiente.id));
  });
}

// Pantalla abierta: evita que se le saque de la cola por abandono.
export function marcarVisto(id: number) {
  db().prepare("UPDATE recargas SET visto = ? WHERE id = ?").run(reloj(), id);
}

// Reloj en segundo plano: avanza la cola aunque nadie haga peticiones.
const g = globalThis as unknown as { __pozoRelojCola?: NodeJS.Timeout };
export function arrancarRelojCola() {
  g.__pozoRelojCola ??= setInterval(() => {
    try {
      avanzarCola();
    } catch (e) {
      console.error("[cola] no se pudo avanzar:", e);
    }
  }, 1000);
}

// --- Acciones del usuario ---

// Si falló su último turno hace menos de 10 minutos, espera 1 minuto.
function penalizacion(usuarioId: number) {
  const ultima = db()
    .prepare(
      `SELECT estado, fin FROM recargas WHERE usuario_id = ? AND inicio > 0
       AND estado IN ('acreditada', 'revision', 'vencida', 'cancelada') ORDER BY id DESC LIMIT 1`,
    )
    .get(usuarioId) as { estado: string; fin: number } | undefined;
  const fallo = ultima && (ultima.estado === "vencida" || ultima.estado === "cancelada");
  return fallo && reloj() - ultima.fin < MEMORIA_FALLOS_MS ? PENALIZACION_MS : 0;
}

export function abrirRecarga(usuarioId: number, montoEsperado: number) {
  exigir(montoEsperado >= 100, "Recarga al menos S/ 1.00.");
  const abierta = recargaAbiertaDe(usuarioId);
  if (abierta) return abierta.id;
  const ahora = reloj();
  const r = db()
    .prepare(
      `INSERT INTO recargas (usuario_id, estado, inicio, expira, disponible_desde, visto, monto_esperado)
       VALUES (?, 'en_cola', 0, 0, ?, ?, ?)`,
    )
    .run(usuarioId, ahora + penalizacion(usuarioId), ahora, montoEsperado);
  avanzarCola();
  return Number(r.lastInsertRowid);
}

export function guardarComprobante(recargaId: number, usuarioId: number, fichero: string) {
  const r = recarga(recargaId);
  exigir(r && r.usuario_id === usuarioId, "Esa recarga no es tuya.");
  db().prepare("UPDATE recargas SET comprobante = ? WHERE id = ?").run(fichero, recargaId);
}

export function cancelarRecarga(recargaId: number, usuarioId: number) {
  const r = db()
    .prepare(
      `UPDATE recargas SET estado = 'cancelada', fin = ?
       WHERE id = ? AND usuario_id = ? AND estado IN ('en_cola', 'escuchando')`,
    )
    .run(reloj(), recargaId, usuarioId);
  if (r.changes) {
    avisar(porId(recargaId));
    avanzarCola();
  }
}

// El usuario dice que un pago detectado es suyo aunque el nombre no cuadre.
export function reclamarPago(recargaId: number, usuarioId: number, pagoId: number) {
  transaccion(() => {
    const r = recarga(recargaId);
    exigir(r && r.usuario_id === usuarioId, "Esa recarga no es tuya.");
    // También vale con la recarga vencida: el Yape pudo llegar a tiempo y no
    // reconocerse solo.
    exigir(r.estado === "escuchando" || r.estado === "vencida", "Esta recarga ya no está activa.");
    const p = db().prepare("SELECT * FROM pagos_yape WHERE id = ?").get(pagoId) as PagoYape | undefined;
    exigir(p && p.estado === "libre", "Ese pago ya fue asignado.");
    exigir(r.inicio && p.recibido >= r.inicio, "Ese Yape llegó antes de que empezara tu turno.");
    exigir(p.recibido <= r.expira + GRACIA_MS, "Ese Yape llegó después de que terminara tu turno.");
    db()
      .prepare("UPDATE recargas SET estado = 'revision', pago_id = ?, monto = ?, nota = ?, fin = ? WHERE id = ?")
      .run(pagoId, p.monto, `Reclamado: Yape de ${p.nombre}`, reloj(), recargaId);
    avisar(porId(recargaId));
    avanzarCola();
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
  avanzarCola();
  const candidatas = db()
    .prepare(
      `SELECT r.*, u.nombre_yape FROM recargas r JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.estado = 'escuchando' AND r.inicio <= ? AND r.expira + ? >= ?`,
    )
    .all(pago.recibido, GRACIA_MS, pago.recibido) as (Recarga & { nombre_yape: string })[];
  const elegida = elegirCandidata(candidatas, pago);
  if (!elegida) return null;
  acreditar(elegida.id, pago.id);
  return elegida.id;
}

// El monto siempre tiene que cuadrar: solo es suyo un Yape por el monto exacto
// que dijo al empezar, venga de la cuenta que venga. Si coincidiera con varios
// turnos (no debería: el turno es exclusivo), desempata el nombre; si aun así
// no hay uno claro, lo resuelve el admin.
function elegirCandidata<T extends { nombre_yape: string; monto_esperado: number }>(
  candidatas: T[],
  pago: { nombre: string; monto: number },
) {
  const porMonto = candidatas.filter((c) => c.monto_esperado === pago.monto);
  if (porMonto.length <= 1) return porMonto[0] ?? null;
  const puntuadas = porMonto
    .map((c) => ({ c, ...puntuarNombre(c.nombre_yape, pago.nombre) }))
    .sort((x, y) => y.puntos - x.puntos);
  return puntuadas[0].puntos > puntuadas[1].puntos ? puntuadas[0].c : null;
}

export function acreditar(recargaId: number, pagoId: number) {
  transaccion(() => {
    const r = db().prepare("SELECT * FROM recargas WHERE id = ?").get(recargaId) as Recarga | undefined;
    const p = db().prepare("SELECT * FROM pagos_yape WHERE id = ?").get(pagoId) as PagoYape | undefined;
    exigir(r && (r.estado === "escuchando" || r.estado === "revision" || r.estado === "vencida"), "Esa recarga ya se cerró.");
    exigir(p && p.estado === "libre", "Ese pago ya se usó.");
    db().prepare("UPDATE pagos_yape SET estado = 'acreditado', recarga_id = ? WHERE id = ?").run(recargaId, pagoId);
    db()
      .prepare("UPDATE recargas SET estado = 'acreditada', pago_id = ?, monto = ?, nota = ?, fin = ? WHERE id = ?")
      .run(pagoId, p.monto, `Yape de ${p.nombre}`, reloj(), recargaId);
    mover(r.usuario_id, p.monto, "recarga", `Recarga por Yape (${p.nombre}, ${soles(p.monto)})`);
    avisar(porId(recargaId));
    avanzarCola();
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
