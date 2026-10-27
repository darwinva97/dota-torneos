// Prueba de la lógica de dinero sin pasar por la web.
// Uso: DATA_DIR=$(mktemp -d) npx tsx --conditions=react-server scripts/prueba-logica.ts
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { mover } from "../src/lib/billetera";
import * as Bi from "../src/lib/billetera";
import * as T from "../src/lib/torneos";
import * as M from "../src/lib/mercados";
import * as R from "../src/lib/yape/recargas";
import * as Y from "../src/lib/yape/yapi";

const conn = db();
const nuevo = (usuario: string, yape: string) =>
  Number(
    conn
      .prepare("INSERT INTO usuarios (usuario, nombre, nombre_yape, pass_hash) VALUES (?, ?, ?, 'x')")
      .run(usuario, usuario, yape).lastInsertRowid,
  );
const saldo = (id: number) => (conn.prepare("SELECT saldo FROM usuarios WHERE id = ?").get(id) as { saldo: number }).saldo;
const total = () => (conn.prepare("SELECT SUM(saldo) s FROM usuarios").get() as { s: number }).s;

// --- Nombres ---
assert.ok(R.nombreCoincide("Juan Carlos Pérez Rojas", "JUAN C. PEREZ R."));
assert.ok(R.nombreCoincide("Juan Carlos Pérez Rojas", "Juan Perez"));
assert.ok(!R.nombreCoincide("Juan Carlos Pérez Rojas", "Juan Quispe"));
assert.ok(R.nombreCoincide("Juan Carlos Pérez Rojas", "Carlos Perez")); // segundo nombre + apellido
assert.ok(!R.nombreCoincide("Juan Carlos Pérez Rojas", "Pedro Perez"));
assert.ok(!R.nombreCoincide("Juan Carlos Pérez Rojas", "Juan"));

// --- Recargas ---
const jugadores = Array.from({ length: 6 }, (_, i) => nuevo(`j${i}`, `Jugador${i} Apellido${i}`));
for (const [i, id] of jugadores.entries()) {
  const r = R.abrirRecarga(id);
  const res = R.ingresarPago({ externoId: `p${i}`, monto: 5000, nombre: `JUGADOR${i} A.`, recibido: Date.now(), fuente: "test" });
  assert.equal(res.nuevo && res.recargaId, r, `la recarga de j${i} se acredita sola`);
  assert.equal(saldo(id), 5000);
}
// Duplicado: el mismo id externo no acredita dos veces.
assert.equal(R.ingresarPago({ externoId: "p0", monto: 5000, nombre: "JUGADOR0 A.", recibido: Date.now(), fuente: "test" }).nuevo, false);
// Ventana de 3 minutos: no cuenta un Yape anterior a pulsar ni uno muy tardío.
const rTarde = R.abrirRecarga(jugadores[0]);
const inicio = R.recarga(rTarde)!.inicio;
const antes = R.ingresarPago({ externoId: "previo", monto: 1000, nombre: "Jugador0 Apellido0", recibido: inicio - 5_000, fuente: "test" });
assert.equal(antes.nuevo && antes.recargaId, null, "un Yape anterior a la recarga no cuenta");
const tarde = R.ingresarPago({ externoId: "tarde", monto: 1000, nombre: "Jugador0 Apellido0", recibido: inicio + 3 * 60_000 + 31_000, fuente: "test" });
assert.equal(tarde.nuevo && tarde.recargaId, null, "pasados 3 min + 30 s de gracia no cuenta");
const justo = R.ingresarPago({ externoId: "justo", monto: 1000, nombre: "Jugador0 Apellido0", recibido: inicio + 3 * 60_000 + 10_000, fuente: "test" });
assert.equal(justo.nuevo && justo.recargaId, rTarde, "dentro de la gracia sí cuenta");
assert.equal(saldo(jugadores[0]), 6000);

// Lectura de notificaciones de Yape que reenvía yapi.
assert.deepEqual(Y.leerNotificacionYape("Confirmación de Pago", "Yape! Juan C. Perez R. te envió un pago por S/ 20. El cód. de seguridad es: 123"), { nombre: "Juan C. Perez R.", monto: 2000 });
assert.deepEqual(Y.leerNotificacionYape("Yape", "MARIA LOPEZ te envió un pago por S/ 1,250.5"), { nombre: "MARIA LOPEZ", monto: 125050 });
assert.equal(Y.leerNotificacionYape("Yape", "Yapeaste S/ 20 a Juan Perez"), null);
const pYapi = Y.pagoDesdeYapi({ deliveredAt: new Date().toISOString(), notification: { id: "n1", title: "Confirmación de Pago", description: "Yape! Rosa Diaz te envió un pago por S/ 7.50" } });
const pYapi2 = Y.pagoDesdeYapi({ deliveredAt: new Date().toISOString(), notification: { id: "n2", title: "Confirmación de Pago", description: "Yape! Rosa Diaz te envió un pago por S/ 7.50" } });
assert.equal(pYapi?.monto, 750);
assert.equal(pYapi?.externoId, pYapi2?.externoId, "la misma notificación repetida no se cuenta dos veces");
// Nombre que no cuadra: queda libre y se reclama con captura.
const rj1 = R.abrirRecarga(jugadores[1]);
const libre = R.ingresarPago({ externoId: "ajeno", monto: 700, nombre: "Maria Lopez", recibido: Date.now(), fuente: "test" });
assert.equal(libre.nuevo && libre.recargaId, null);
assert.throws(() => R.reclamarPago(rj1, jugadores[1], libre.nuevo ? libre.pagoId : 0), /captura/);
R.guardarComprobante(rj1, jugadores[1], "x.png");
R.reclamarPago(rj1, jugadores[1], libre.nuevo ? libre.pagoId : 0);
R.acreditar(rj1, libre.nuevo ? libre.pagoId : 0);
assert.equal(saldo(jugadores[1]), 5700);
const dinero0 = total();

// --- Torneo de 3 equipos de 2 (cuadro de 4 con un bye), reparto 70-30 ---
const tid = T.crearTorneo({ organizadorId: jugadores[0], nombre: "Copa", descripcion: "", entrada: 1000, garantia: 0, limiteLlegada: "", tamEquipo: 2, maxEquipos: 4, reparto: "70-30", fecha: "", premioBase: 0, sumaRecaudado: true });
T.crearEquipo(tid, jugadores[0], "Alfa");
T.crearEquipo(tid, jugadores[2], "Bravo");
T.crearEquipo(tid, jugadores[4], "Charlie");
const eq = T.equiposDe(tid);
T.unirseEquipo(eq[0].id, jugadores[1]);
T.unirseEquipo(eq[1].id, jugadores[3]);
T.unirseEquipo(eq[2].id, jugadores[5]);
assert.throws(() => T.unirseEquipo(eq[0].id, jugadores[2]), /Ya estás inscrito/);
assert.equal(T.torneo(tid)!.pozo, 6000);
// Salir devuelve la entrada; volver a entrar la cobra.
T.salirDeTorneo(tid, jugadores[5]);
assert.equal(saldo(jugadores[5]), 5000);
T.unirseEquipo(eq[2].id, jugadores[5]);
assert.equal(total(), dinero0 - 6000);

T.iniciarTorneo(tid, jugadores[0], false);
let partidas = T.partidasDe(tid);
assert.equal(partidas.length, 3);
assert.equal(partidas.filter((p) => p.estado === "bye").length, 1);

// Apuesta parimutuel sobre la primera partida jugable.
const jugable = partidas.find((p) => p.ronda === 1 && p.estado === "pendiente")!;
const mid = M.crearMercado({
  creadorId: jugadores[0], titulo: "Partida 1", torneoId: tid, partidaId: jugable.id,
  opciones: [{ etiqueta: "a", equipoId: jugable.equipo_a! }, { etiqueta: "b", equipoId: jugable.equipo_b! }],
});
const [oa, ob] = M.opcionesDe(mid);
M.apostar(jugadores[0], mid, oa.id, 1000);
M.apostar(jugadores[1], mid, oa.id, 333);
M.apostar(jugadores[2], mid, ob.id, 2000);
assert.throws(() => M.apostar(jugadores[0], mid, ob.id, 100), /otra opción/);
T.marcarEnJuego(jugable.id, jugadores[0], false);
assert.throws(() => M.apostar(jugadores[3], mid, ob.id, 100), /ya no acepta/);
const antes0 = saldo(jugadores[0]);
const antes1 = saldo(jugadores[1]);
T.reportarGanador(jugable.id, jugable.equipo_a!, jugadores[0], false);
// Pozo 3333 entre 1333 acertados: 1000→2500 (+1 de redondeo como mayor), 333→832
assert.equal(saldo(jugadores[0]) - antes0 + saldo(jugadores[1]) - antes1, 3333);
assert.equal(M.mercado(mid)!.estado, "resuelto");

// Jugar el resto del cuadro.
partidas = T.partidasDe(tid);
const otra = partidas.find((p) => p.ronda === 1 && p.estado === "pendiente");
assert.equal(otra, undefined);
const final = partidas.find((p) => p.ronda === 2)!;
assert.ok(final.equipo_a && final.equipo_b, "la final tiene a los dos equipos");
assert.throws(() => T.reportarGanador(final.id, final.equipo_a!, jugadores[3], false), /Solo quien organiza/);
T.reportarGanador(final.id, final.equipo_a!, jugadores[0], false);
const t = T.torneo(tid)!;
assert.equal(t.estado, "finalizado");
// Todo el dinero se conserva: nada se crea ni se pierde.
assert.equal(total(), dinero0);
const premios = conn.prepare("SELECT SUM(monto) s FROM movimientos WHERE tipo = 'premio'").get() as { s: number };
assert.equal(premios.s, 6000);

// Apuesta libre que nadie acierta: se devuelve todo.
const libreId = M.crearMercado({ creadorId: jugadores[3], titulo: "¿Llueve?", opciones: [{ etiqueta: "Sí" }, { etiqueta: "No" }] });
const [si, no] = M.opcionesDe(libreId);
M.apostar(jugadores[3], libreId, si.id, 500);
M.resolverMercado(libreId, no.id);
assert.equal(M.mercado(libreId)!.estado, "anulado");
assert.equal(total(), dinero0);

// Torneo cancelado devuelve todo.
const t2 = T.crearTorneo({ organizadorId: jugadores[1], nombre: "Otra", descripcion: "", entrada: 500, garantia: 0, limiteLlegada: "", tamEquipo: 5, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: true });
T.crearEquipo(t2, jugadores[1], "Equis");
T.crearEquipo(t2, jugadores[2], "Ye");
T.iniciarTorneo(t2, jugadores[1], false);
T.cancelarTorneo(t2, jugadores[1], false);
assert.equal(total(), dinero0);

// Garantía de puntualidad: S/ 8 = S/ 2 al pozo + S/ 6 de garantía.
const tg = T.crearTorneo({ organizadorId: jugadores[0], nombre: "Puntual", descripcion: "", entrada: 200, garantia: 600, limiteLlegada: "9 pm", tamEquipo: 2, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: true });
const s0 = saldo(jugadores[0]);
T.crearEquipo(tg, jugadores[0], "Puntuales");
assert.equal(saldo(jugadores[0]), s0 - 800, "se cobra entrada + garantía");
T.salirDeTorneo(tg, jugadores[0]);
assert.equal(saldo(jugadores[0]), s0, "al salir se devuelve todo");
T.crearEquipo(tg, jugadores[0], "Puntuales");
T.crearEquipo(tg, jugadores[2], "Tardones");
const [eqP, eqT] = T.equiposDe(tg);
T.unirseEquipo(eqP.id, jugadores[1]);
T.unirseEquipo(eqT.id, jugadores[3]);
assert.equal(T.torneo(tg)!.pozo, 800);
assert.equal(T.torneo(tg)!.garantias_pendientes, 2400);
assert.throws(() => T.marcarAsistencia(tg, jugadores[1], "a_tiempo", jugadores[3], false), /Solo quien organiza/);
T.marcarAsistencia(tg, jugadores[0], "a_tiempo", jugadores[0], false);
T.marcarAsistencia(tg, jugadores[1], "a_tiempo", jugadores[0], false);
T.marcarAsistencia(tg, jugadores[2], "a_tiempo", jugadores[0], false);
assert.throws(() => T.iniciarTorneo(tg, jugadores[0], false), /Falta marcar la asistencia de 1 jugador/);
T.marcarAsistencia(tg, jugadores[3], "falto", jugadores[0], false);
const antesSorteo = [0, 1, 2, 3].map((k) => saldo(jugadores[k]));
T.iniciarTorneo(tg, jugadores[0], false);
assert.deepEqual([0, 1, 2, 3].map((k) => saldo(jugadores[k]) - antesSorteo[k]), [600, 600, 600, 0], "garantía solo a quien llegó");
assert.equal(T.torneo(tg)!.pozo, 1400, "la garantía del que faltó pasa al pozo");
assert.equal(T.torneo(tg)!.garantias_pendientes, 0);
assert.throws(() => T.marcarAsistencia(tg, jugadores[3], "a_tiempo", jugadores[0], false), /antes de sortear/);
const finalG = T.partidasDe(tg)[0];
T.reportarGanador(finalG.id, eqT.id, jugadores[0], false);
assert.equal(saldo(jugadores[2]) - antesSorteo[2], 600 + 700, "el campeón cobra su parte del pozo con la garantía perdida");
assert.equal(total(), dinero0);

// Cancelar tras el sorteo devuelve la entrada y la garantía perdida.
const tc = T.crearTorneo({ organizadorId: jugadores[0], nombre: "Cancelable", descripcion: "", entrada: 200, garantia: 600, limiteLlegada: "", tamEquipo: 1, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: true });
T.crearEquipo(tc, jugadores[4], "Uno");
T.crearEquipo(tc, jugadores[5], "Dos");
T.marcarAsistencia(tc, jugadores[4], "a_tiempo", jugadores[0], false);
T.marcarAsistencia(tc, jugadores[5], "falto", jugadores[0], false);
T.iniciarTorneo(tc, jugadores[0], false);
T.cancelarTorneo(tc, jugadores[0], false);
assert.equal(total(), dinero0, "cancelar no crea ni pierde dinero");

// Retiros: se descuentan al pedir; cancelar o rechazar devuelve; pagar no.
const sr = saldo(jugadores[4]);
Bi.pedirRetiro(jugadores[4], 300, "987 654 321");
Bi.pedirRetiro(jugadores[4], 200, "987654321");
Bi.pedirRetiro(jugadores[4], 100, "987654321");
assert.throws(() => Bi.pedirRetiro(jugadores[4], 100, "987654321"), /3 retiros pendientes/);
assert.throws(() => Bi.pedirRetiro(jugadores[4], 100, "12345"), /9 dígitos/);
assert.equal(saldo(jugadores[4]), sr - 600);
assert.equal(Bi.solicitudesPendientes().retiros, 3);
const [r3, r2, r1] = Bi.retirosDe(jugadores[4]);
assert.throws(() => Bi.cancelarRetiro(r1.id, jugadores[5]), /no es tuyo/);
Bi.cancelarRetiro(r1.id, jugadores[4]);
Bi.resolverRetiro(r2.id, { pagado: false, motivo: "Número equivocado" });
Bi.resolverRetiro(r3.id, { pagado: true, operacion: "00123" });
assert.throws(() => Bi.resolverRetiro(r3.id, { pagado: true, operacion: "x" }), /ya no está pendiente/);
assert.equal(saldo(jugadores[4]), sr - 100, "solo se descuenta el retiro pagado");
assert.equal(Bi.solicitudesPendientes().retiros, 0);
assert.equal(Bi.retirosDe(jugadores[4]).find((r) => r.id === r2.id)!.nota, "Número equivocado");
assert.equal(Bi.resumen(jugadores[4]).retirado, 100);
// Lo pagado salió del sistema hacia el Yape del jugador.
assert.equal(total(), dinero0 - 100);

// Premio base que suma lo recaudado: premio = 1000 de base + 2 × 300.
const so = saldo(jugadores[0]);
const tb = T.crearTorneo({ organizadorId: jugadores[0], nombre: "Con base", descripcion: "", entrada: 300, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 1000, sumaRecaudado: true });
assert.equal(saldo(jugadores[0]), so - 1000, "el premio base sale del organizador");
T.crearEquipo(tb, jugadores[1], "Uno");
T.crearEquipo(tb, jugadores[2], "Dos");
T.aumentarPremio(tb, jugadores[0], 500);
assert.throws(() => T.aumentarPremio(tb, jugadores[1], 500), /Solo quien organiza/);
assert.equal(T.torneo(tb)!.pozo, 1500 + 600);
T.iniciarTorneo(tb, jugadores[0], false);
const s2 = saldo(jugadores[2]);
const fb = T.partidasDe(tb)[0];
const eqDos = T.equiposDe(tb).find((e) => e.nombre === "Dos")!;
T.reportarGanador(fb.id, eqDos.id, jugadores[0], false);
assert.equal(saldo(jugadores[2]) - s2, 2100, "el campeón cobra base + inscripciones");
assert.equal(total(), dinero0 - 100);

// Premio fijo: el campeón cobra solo la base; lo recaudado vuelve al organizador.
const so2 = saldo(jugadores[0]);
assert.throws(() => T.crearTorneo({ organizadorId: jugadores[0], nombre: "Fijo sin base", descripcion: "", entrada: 300, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: false }), /premio base/);
const tf = T.crearTorneo({ organizadorId: jugadores[0], nombre: "Fijo", descripcion: "", entrada: 300, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 2000, sumaRecaudado: false });
T.crearEquipo(tf, jugadores[1], "Uno");
T.crearEquipo(tf, jugadores[3], "Tres");
assert.equal(T.torneo(tf)!.pozo, 2000);
assert.equal(T.torneo(tf)!.recaudado, 600);
T.iniciarTorneo(tf, jugadores[0], false);
const s1 = saldo(jugadores[1]);
const eqUno = T.equiposDe(tf).find((e) => e.nombre === "Uno")!;
T.reportarGanador(T.partidasDe(tf)[0].id, eqUno.id, jugadores[0], false);
assert.equal(saldo(jugadores[1]) - s1, 2000, "premio fijo");
assert.equal(saldo(jugadores[0]) - so2, -2000 + 600, "el organizador recupera lo recaudado");
assert.equal(total(), dinero0 - 100);

// Cancelar devuelve el premio base al organizador.
const so3 = saldo(jugadores[0]);
const tx = T.crearTorneo({ organizadorId: jugadores[0], nombre: "Se cancela", descripcion: "", entrada: 0, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 700, sumaRecaudado: true });
T.cancelarTorneo(tx, jugadores[0], false);
assert.equal(saldo(jugadores[0]), so3);

// Deudas: se retiene lo que haya y lo que entre después, y bloquea hasta saldarla.
const deudor = nuevo("moroso", "Moroso Perez");
R.abrirRecarga(deudor);
R.ingresarPago({ externoId: "moroso-1", monto: 300, nombre: "Moroso Perez", recibido: Date.now(), fuente: "test" });
assert.equal(saldo(deudor), 300);
const sAcreedor = saldo(jugadores[0]);
Bi.crearDeuda({ deudorId: deudor, acreedorId: jugadores[0], monto: 1000, motivo: "Debe la entrada", creadoPor: jugadores[0] });
assert.equal(saldo(deudor), 0, "se retiene el saldo que tenía");
assert.equal(saldo(jugadores[0]) - sAcreedor, 300, "y pasa al acreedor");
assert.equal(Bi.deudaPendiente(deudor), 700);
const tdeuda = T.crearTorneo({ organizadorId: jugadores[0], nombre: "Gratis", descripcion: "", entrada: 0, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: true });
assert.throws(() => T.crearEquipo(tdeuda, deudor, "Morosos"), /deuda de S\/ 7.00/);
assert.throws(() => Bi.pedirRetiro(deudor, 100, "987654321"), /deuda/);
R.abrirRecarga(deudor);
R.ingresarPago({ externoId: "moroso-2", monto: 1000, nombre: "Moroso Perez", recibido: Date.now(), fuente: "test" });
assert.equal(saldo(deudor), 300, "de 10 soles, 7 pagan la deuda");
assert.equal(Bi.deudaPendiente(deudor), 0);
assert.equal(Bi.deudasDe(deudor)[0].estado, "pagada");
T.crearEquipo(tdeuda, deudor, "Morosos");
// Perdonar libera sin mover dinero.
Bi.crearDeuda({ deudorId: deudor, acreedorId: jugadores[1], monto: 5000, motivo: "Apuesta de palabra", creadoPor: jugadores[0] });
assert.equal(saldo(deudor), 0);
Bi.perdonarDeuda(Bi.listarDeudas("pendiente")[0].id);
assert.equal(Bi.deudaPendiente(deudor), 0);
assert.throws(() => Bi.crearDeuda({ deudorId: deudor, acreedorId: deudor, monto: 100, motivo: "Prueba", creadoPor: jugadores[0] }), /sí mismo/);
// Las deudas mueven dinero entre jugadores, no lo crean ni lo destruyen.
assert.equal(total(), dinero0 - 100 + 1300);

// Saldo insuficiente.
assert.throws(() => mover(jugadores[4], -999999, "apuesta", "x"), /Saldo insuficiente/);
console.log("Todo bien: la lógica de dinero cuadra.");
