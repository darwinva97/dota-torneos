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
// Yape oculta el apellido con * desde noviembre de 2026 (caso real de Kanay).
assert.ok(R.nombreCoincide("Alain Jherimy Conislla Alamo", "Alain Con*"));
assert.ok(!R.nombreCoincide("Alain Jherimy Conislla Alamo", "Alain Per*"));
assert.ok(!R.nombreCoincide("Alain Jherimy Conislla Alamo", "Alain Co"), "sin * no se toma como prefijo");
assert.ok(R.nombreCoincide("Darwin Vilcachagua Ayala", "DARWIN STALIN VILCACHAGUA"));
assert.ok(R.nombreCoincide("Alain Jherimy Conislla Alamo", "Jherimy Conislla"), "sin el primer nombre");
assert.ok(!R.nombreCoincide("Rosa Diaz", "Rosa"));

// --- Recargas ---
const jugadores = Array.from({ length: 6 }, (_, i) => nuevo(`j${i}`, `Jugador${i} Apellido${i}`));
for (const [i, id] of jugadores.entries()) {
  const r = R.abrirRecarga(id, 5000);
  const res = R.ingresarPago({ externoId: `p${i}`, monto: 5000, nombre: `JUGADOR${i} A.`, recibido: Date.now(), fuente: "test" });
  assert.equal(res.nuevo && res.recargaId, r, `la recarga de j${i} se acredita sola`);
  assert.equal(saldo(id), 5000);
}
// Duplicado: el mismo id externo no acredita dos veces.
assert.equal(R.ingresarPago({ externoId: "p0", monto: 5000, nombre: "JUGADOR0 A.", recibido: Date.now(), fuente: "test" }).nuevo, false);
// Ventana de 3 minutos: no cuenta un Yape anterior a pulsar ni uno muy tardío.
const rTarde = R.abrirRecarga(jugadores[0], 1000);
const inicio = R.recarga(rTarde)!.inicio;
const antes = R.ingresarPago({ externoId: "previo", monto: 1000, nombre: "Jugador0 Apellido0", recibido: inicio - 5_000, fuente: "test" });
assert.equal(antes.nuevo && antes.recargaId, null, "un Yape anterior a la recarga no cuenta");
const tarde = R.ingresarPago({ externoId: "tarde", monto: 1000, nombre: "Jugador0 Apellido0", recibido: inicio + R.TURNO_MS + 21_000, fuente: "test" });
assert.equal(tarde.nuevo && tarde.recargaId, null, "pasado el turno + 20 s de gracia no cuenta");
const justo = R.ingresarPago({ externoId: "justo", monto: 1000, nombre: "Jugador0 Apellido0", recibido: inicio + R.TURNO_MS + 10_000, fuente: "test" });
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
// Monto que no cuadra: queda libre y el usuario lo reclama (sin captura).
const rj1 = R.abrirRecarga(jugadores[1], 500);
const libre = R.ingresarPago({ externoId: "ajeno", monto: 700, nombre: "Maria Lopez", recibido: Date.now(), fuente: "test" });
assert.equal(libre.nuevo && libre.recargaId, null);
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
  creadorId: jugadores[0], titulo: "Partida 1", torneoId: tid, partidaId: jugable.id, modalidad: "pozo",
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
const libreId = M.crearMercado({ creadorId: jugadores[3], titulo: "¿Llueve?", modalidad: "pozo", opciones: [{ etiqueta: "Sí" }, { etiqueta: "No" }] });
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
R.abrirRecarga(deudor, 300);
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
R.abrirRecarga(deudor, 1000);
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

// Con el turno exclusivo basta una palabra entera en común con quien lo tiene.
const solo1 = nuevo("solo1", "Kevin Ramos Lazo");
const rs = R.abrirRecarga(solo1, 200);
const ps = R.ingresarPago({ externoId: "solo-1", monto: 200, nombre: "Kevin Tor*", recibido: Date.now(), fuente: "test" });
assert.equal(ps.nuevo && ps.recargaId, rs, "monto exacto");
const rs2 = R.abrirRecarga(solo1, 300);
const ajeno = R.ingresarPago({ externoId: "ajeno-2", monto: 200, nombre: "Maria Lopez", recibido: Date.now(), fuente: "test" });
assert.equal(ajeno.nuevo && ajeno.recargaId, null, "el monto no cuadra");
R.cancelarRecarga(rs2, solo1);

// Reclamo con la recarga ya vencida: vale si el Yape llegó dentro de la ventana.
const tardio = nuevo("tardio", "Pedro Tardio");
const rv = R.abrirRecarga(tardio, 700);
const iv = R.recarga(rv)!.inicio;
const pv = R.ingresarPago({ externoId: "otra-cuenta", monto: 500, nombre: "Rosa M*", recibido: iv + 40_000, fuente: "test" });
assert.equal(pv.nuevo && pv.recargaId, null);
db().prepare("UPDATE recargas SET estado = 'vencida', fin = ? WHERE id = ?").run(Date.now(), rv);
assert.equal(R.pagosLibresDeVentana(R.recarga(rv)!).length, 1);
R.reclamarPago(rv, tardio, pv.nuevo ? pv.pagoId : 0);
assert.equal(R.recarga(rv)!.estado, "revision");

// --- Parche: el evento solo empieza o se resuelve con los dos bandos iguales ---
const pa = nuevo("parcheA", "Pablo Ruiz");
const pb = nuevo("parcheB", "Bruno Diaz");
const pc = nuevo("parcheC", "Cesar Lima");
for (const [k, u] of [pa, pb, pc].entries()) {
  R.abrirRecarga(u, 5000);
  R.ingresarPago({ externoId: `parche-${k}`, monto: 5000, nombre: ["Pablo Ruiz", "Bruno Diaz", "Cesar Lima"][k], recibido: Date.now(), fuente: "test" });
}
assert.throws(() => M.crearMercado({ creadorId: pa, titulo: "Tres bandos", opciones: [{ etiqueta: "x" }, { etiqueta: "y" }, { etiqueta: "z" }] }), /dos bandos/);
const mp = M.crearMercado({ creadorId: pa, titulo: "Ajedrez Pablo vs Bruno", opciones: [{ etiqueta: "Pablo" }, { etiqueta: "Bruno" }] });
assert.equal(M.mercado(mp)!.modalidad, "parche", "parche por defecto");
const [opP, opB] = M.opcionesDe(mp);
M.apostar(pa, mp, opP.id, 2000);
M.apostar(pb, mp, opB.id, 1200);
assert.equal(M.estadoParche(mp)!.falta, 800);
assert.throws(() => M.cerrarMercado(mp), /no está parchada.*Faltan S\/ 8.00 por Bruno/);
assert.throws(() => M.resolverMercado(mp, opP.id), /no está parchada/);
// Cesar entra por Bruno pero se pasa: ahora sobra en el bando de Bruno.
M.apostar(pc, mp, opB.id, 1000);
assert.equal(M.estadoParche(mp)!.bajo!.etiqueta, "Pablo");
// Cesar se arrepiente y retira; vuelve a faltar 8 por Bruno.
const sc = saldo(pc);
M.retirarApuesta(pc, mp);
assert.equal(saldo(pc) - sc, 1000);
// Se devuelve lo no parchado: a Pablo le vuelven 8 y quedan 12 contra 12.
const sp = saldo(pa);
M.devolverNoParchado(mp);
assert.equal(saldo(pa) - sp, 800);
assert.ok(M.estadoParche(mp)!.parchada);
M.cerrarMercado(mp);
assert.throws(() => M.retirarApuesta(pb, mp), /cerrada/);
const sb = saldo(pb);
M.resolverMercado(mp, opB.id);
assert.equal(saldo(pb) - sb, 2400, "quien gana el parche cobra el doble");
// Empate (tablas): se devuelve a todos.
const me = M.crearMercado({ creadorId: pa, titulo: "Revancha", opciones: [{ etiqueta: "Pablo" }, { etiqueta: "Bruno" }] });
const [eP, eB] = M.opcionesDe(me);
M.apostar(pa, me, eP.id, 500);
M.apostar(pb, me, eB.id, 500);
const antesEmpate = [saldo(pa), saldo(pb)];
M.empatar(me);
assert.deepEqual([saldo(pa) - antesEmpate[0], saldo(pb) - antesEmpate[1]], [500, 500]);
// Un bando vacío: devolver lo no parchado anula la apuesta.
const mv = M.crearMercado({ creadorId: pa, titulo: "Sin rival", opciones: [{ etiqueta: "Sí" }, { etiqueta: "No" }] });
M.apostar(pa, mv, M.opcionesDe(mv)[0].id, 300);
M.devolverNoParchado(mv);
assert.equal(M.mercado(mv)!.estado, "anulado");
// En un torneo, la partida no puede empezar ni resolverse sin parchar.
const tp = T.crearTorneo({ organizadorId: pa, nombre: "Ajedrez blitz", descripcion: "", entrada: 0, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 2, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: true, juego: "ajedrez", ritmo: "blitz 3+2" });
assert.equal(T.torneo(tp)!.juego, "ajedrez");
T.crearEquipo(tp, pa, "Pablo");
T.crearEquipo(tp, pb, "Bruno");
T.iniciarTorneo(tp, pa, false);
const ptd = T.partidasDe(tp)[0];
const mpt = M.crearMercado({ creadorId: pc, titulo: "Final", torneoId: tp, partidaId: ptd.id, opciones: T.equiposDe(tp).map((e) => ({ etiqueta: e.nombre, equipoId: e.id })) });
M.apostar(pc, mpt, M.opcionesDe(mpt)[0].id, 700);
assert.throws(() => T.marcarEnJuego(ptd.id, pa, false), /no está parchada/);
assert.throws(() => T.reportarGanador(ptd.id, ptd.equipo_a!, pa, false), /no está parchada/);
M.apostar(pb, mpt, M.opcionesDe(mpt)[1].id, 700);
T.marcarEnJuego(ptd.id, pa, false);
T.reportarGanador(ptd.id, M.opcionesDe(mpt)[0].equipo_id!, pa, false);
assert.equal(M.mercado(mpt)!.estado, "resuelto");

// --- Gestión de usuarios del admin ---
const jefe = nuevo("jefe", "Jefe Pozo");
const multado = nuevo("multado", "Mul Tado");
Bi.ajustarSaldo(multado, 1500, "Pagó en efectivo", "jefe");
assert.equal(saldo(multado), 1500);
Bi.ajustarSaldo(multado, -500, "Corrección", "jefe");
assert.equal(saldo(multado), 1000);
assert.throws(() => Bi.ajustarSaldo(multado, -5000, "Demasiado", "jefe"), /Saldo insuficiente/);
assert.throws(() => Bi.ajustarSaldo(multado, 100, "", "jefe"), /motivo/);
const sJefe = saldo(jefe);
Bi.multar(multado, 1500, "Abandonó la partida", jefe);
assert.equal(saldo(multado), 0, "la multa retiene todo lo que tiene");
assert.equal(saldo(jefe) - sJefe, 1000, "y va al pozo");
assert.equal(Bi.deudaPendiente(multado), 500, "el resto queda pendiente");
assert.throws(() => Bi.multar(jefe, 100, "yo", jefe), /a ti mismo/);
const ficha = Bi.fichaUsuario(multado)!;
assert.equal(ficha.debe, 500);
assert.equal(ficha.saldo, 0);
assert.ok(Bi.resumenUsuarios("multa").some((u) => u.id === multado), "búsqueda por usuario");
Bi.cambiarAdmin(multado, true, jefe);
assert.equal(Bi.fichaUsuario(multado)!.es_admin, 1);
assert.throws(() => Bi.cambiarAdmin(jefe, false, jefe), /a ti mismo/);
Bi.perdonarDeuda(Bi.deudasDe(multado).find((d) => d.estado === "pendiente")!.id);

// --- Formatos de torneo con dinero de por medio ---
const formJug = Array.from({ length: 10 }, (_, k) => nuevo(`fmt${k}`, `Formato${k} Prueba${k}`));
for (const [k, u] of formJug.entries()) {
  R.abrirRecarga(u, 3000);
  R.ingresarPago({ externoId: `fmt-${k}`, monto: 3000, nombre: `Formato${k} Prueba${k}`, recibido: Date.now(), fuente: "test" });
}
const dineroF = total();
// Juega un cuadro entero marcando siempre ganador al lado A (o B al azar fijo).
function jugarCuadro(tid: number, elegir: (p: T.Partida) => "a" | "b") {
  for (let vuelta = 0; vuelta < 200 && T.torneo(tid)!.estado === "en_curso"; vuelta++) {
    const p = T.partidasDe(tid).find((x) => x.estado === "pendiente" && x.equipo_a && x.equipo_b);
    if (!p) break;
    T.reportarResultado(p.id, elegir(p), formJug[0], false);
  }
  assert.equal(T.torneo(tid)!.estado, "finalizado", "el cuadro llega al final");
}
const nuevoFmt = (nombre: string, juego: "dota2" | "ajedrez", formato: string, extra: object = {}) =>
  T.crearTorneo({ organizadorId: formJug[0], nombre, descripcion: "", entrada: 100, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 16, reparto: "70-30", fecha: "", premioBase: 0, sumaRecaudado: true, juego, ritmo: juego === "ajedrez" ? "blitz 3+2" : "", formato: formato as T.Torneo["formato"], ...extra });
// Upper y lower con 5 equipos: cada eliminado pierde dos veces.
const tdoble = nuevoFmt("TI chico", "dota2", "doble");
formJug.slice(0, 5).forEach((u, k) => T.crearEquipo(tdoble, u, `Doble ${k}`));
T.iniciarTorneo(tdoble, formJug[0], false);
assert.ok(T.partidasDe(tdoble).some((p) => p.llave === "L"), "hay lower bracket");
assert.ok(T.partidasDe(tdoble).some((p) => p.llave === "GF"), "hay gran final");
jugarCuadro(tdoble, (p) => (p.id % 3 === 0 ? "b" : "a"));
const perdidas = new Map<number, number>();
for (const p of T.partidasDe(tdoble)) if (p.estado === "jugada") { const l = p.ganador === p.equipo_a ? p.equipo_b! : p.equipo_a!; perdidas.set(l, (perdidas.get(l) ?? 0) + 1); }
const campeonDoble = T.torneo(tdoble)!.campeon_id!;
const gf = T.partidasDe(tdoble).find((p) => p.llave === "GF")!;
const subDoble = gf.ganador === gf.equipo_a ? gf.equipo_b! : gf.equipo_a!;
for (const e of T.equiposDe(tdoble)) if (e.id !== campeonDoble && e.id !== subDoble) assert.equal(perdidas.get(e.id), 2, "eliminado tras dos derrotas");
assert.equal(total(), dineroF, "el premio sale de las inscripciones");
// Combinado: 10 equipos, descarte hasta 4 y luego upper y lower.
const tmix = nuevoFmt("Grande", "dota2", "mixto", { clasifican: 4 });
formJug.forEach((u, k) => T.crearEquipo(tmix, u, `Mix ${k}`));
T.iniciarTorneo(tmix, formJug[0], false);
assert.ok(T.partidasDe(tmix).some((p) => p.llave === "Q") && T.partidasDe(tmix).some((p) => p.llave === "L"));
jugarCuadro(tmix, (p) => (p.id % 2 ? "a" : "b"));
assert.equal(total(), dineroF);
// Ajedrez, todos contra todos con tablas: 4 jugadores, 6 partidas, 3 rondas.
const tliga = nuevoFmt("Liga", "ajedrez", "liga");
formJug.slice(0, 4).forEach((u) => T.crearEquipo(tliga, u, `J${u}`));
T.iniciarTorneo(tliga, formJug[0], false);
assert.equal(T.partidasDe(tliga).length, 6);
assert.throws(() => T.reportarResultado(T.partidasDe(tdoble)[0].id, "tablas", formJug[0], false), /./);
const resLiga: ("a" | "b" | "tablas")[] = ["a", "tablas", "b", "a", "tablas", "a"];
T.partidasDe(tliga).forEach((p, k) => T.reportarResultado(p.id, resLiga[k], formJug[0], false));
const tablaLiga = T.tablaDe(T.torneo(tliga)!);
assert.equal(tablaLiga.reduce((s2, f) => s2 + f.puntos, 0), 6, "se reparten 6 puntos en 6 partidas");
assert.equal(T.torneo(tliga)!.estado, "finalizado");
assert.equal(total(), dineroF);
// Suizo con 5 jugadores y 3 rondas: uno descansa por ronda y luego se reparte.
const tsuizo = nuevoFmt("Suizo", "ajedrez", "suizo", { rondas: 3 });
formJug.slice(0, 5).forEach((u) => T.crearEquipo(tsuizo, u, `J${u}`));
T.iniciarTorneo(tsuizo, formJug[0], false);
for (let r = 1; r <= 3; r++) {
  const ronda = T.partidasDe(tsuizo).filter((p) => p.ronda === r);
  assert.equal(ronda.filter((p) => p.estado === "bye").length, 1, `ronda ${r}: un descanso`);
  for (const p of ronda.filter((x) => x.estado === "pendiente")) T.reportarResultado(p.id, (p.id + r) % 3 === 0 ? "tablas" : "a", formJug[0], false);
}
assert.equal(T.torneo(tsuizo)!.estado, "finalizado");
assert.equal(new Set(T.partidasDe(tsuizo).filter((p) => p.estado === "bye").map((p) => p.equipo_a)).size, 3, "nadie descansa dos veces");
assert.equal(total(), dineroF);

// --- Cola de recargas con reloj simulado ---
db().prepare("UPDATE recargas SET estado = 'cancelada' WHERE estado IN ('en_cola', 'escuchando')").run();
let reloj = Date.now() + 86_400_000;
R.fijarRelojParaPruebas(() => reloj);
const avanzar = (ms: number) => {
  reloj += ms;
  R.avanzarCola();
};
const qa = nuevo("colaA", "Ana Torres Vega");
const qb = nuevo("colaB", "Beto Rios Paz");
const qc = nuevo("colaC", "Carla Mendez Soto");
const ra = R.abrirRecarga(qa, 500);
const rb = R.abrirRecarga(qb, 300);
assert.equal(R.recarga(ra)!.estado, "escuchando", "la primera tiene el turno");
assert.equal(R.vistaRecarga(rb)!.estado, "en_cola");
assert.equal(R.vistaRecarga(rb)!.delante, 1);
// Un Yape de Beto mientras Ana tiene el turno no es de nadie: Beto aún no puede recargar.
const beto1 = R.ingresarPago({ externoId: "beto-1", monto: 300, nombre: "Beto Rios", recibido: reloj, fuente: "test" });
assert.equal(beto1.nuevo && beto1.recargaId, null);
// Ana paga: se acredita y el turno pasa a Beto en el acto.
avanzar(5_000);
const ana1 = R.ingresarPago({ externoId: "ana-1", monto: 500, nombre: "Ana Tor*", recibido: reloj, fuente: "test" });
assert.equal(ana1.nuevo && ana1.recargaId, ra);
const turnoB = R.recarga(rb)!;
assert.equal(turnoB.estado, "escuchando");
assert.equal(turnoB.expira - turnoB.inicio, 30_000, "el turno dura 30 segundos");
// Beto no paga: el turno vence pasado 1:30 + 20 s de gracia.
avanzar(R.TURNO_MS + 19_000);
assert.equal(R.recarga(rb)!.estado, "escuchando", "durante la gracia sigue reservado");
avanzar(2_000);
assert.equal(R.recarga(rb)!.estado, "vencida");
// Vuelve a intentarlo enseguida: espera 1 minuto aunque no haya nadie.
const rb2 = R.abrirRecarga(qb, 300);
assert.equal(R.recarga(rb2)!.estado, "en_cola", "penalizado");
assert.ok(R.vistaRecarga(rb2)!.disponibleDesde > reloj);
// Carla llega durante esa espera y recarga antes que él.
avanzar(10_000);
const rc = R.abrirRecarga(qc, 500);
assert.equal(R.recarga(rc)!.estado, "escuchando", "quien llega durante la penalización va primero");
R.cancelarRecarga(rc, qc);
assert.equal(R.recarga(rb2)!.estado, "en_cola", "el turno libre no se da antes de cumplir el minuto");
avanzar(51_000);
assert.equal(R.recarga(rb2)!.estado, "escuchando", "pasado el minuto empieza su turno");
// Vuelve a fallar: otra vez 1 minuto.
avanzar(R.TURNO_MS + 21_000);
assert.equal(R.recarga(rb2)!.estado, "vencida");
const rb3 = R.abrirRecarga(qb, 400);
assert.equal(R.recarga(rb3)!.estado, "en_cola");
avanzar(61_000);
const turnoB3 = R.recarga(rb3)!;
assert.equal(turnoB3.estado, "escuchando");
// Esta vez paga y se acredita; la siguiente recarga ya no tiene penalización.
avanzar(20_000);
const beto2 = R.ingresarPago({ externoId: "beto-2", monto: 400, nombre: "BETO RIOS PAZ", recibido: reloj, fuente: "test" });
assert.equal(beto2.nuevo && beto2.recargaId, rb3);
const rb4 = R.abrirRecarga(qb, 400);
assert.equal(R.recarga(rb4)!.estado, "escuchando", "tras recargar bien no hay espera");
R.cancelarRecarga(rb4, qb);
// Cancelar el propio turno también penaliza, pero pasados 10 minutos se olvida.
avanzar(10 * 60_000 + 1_000);
const rb5 = R.abrirRecarga(qb, 400);
assert.equal(R.recarga(rb5)!.estado, "escuchando", "fallo de hace más de 10 minutos");
// Quien deja la pantalla abierta conserva su sitio; quien la cierra 2 minutos lo pierde.
const rc2 = R.abrirRecarga(qc, 500);
const rd = R.abrirRecarga(qa, 500);
assert.deepEqual([R.recarga(rc2)!.estado, R.recarga(rd)!.estado], ["en_cola", "en_cola"]);
assert.equal(R.vistaRecarga(rd)!.delante, 2, "Beto con turno y Carla esperando");
avanzar(60_000);
assert.equal(R.recarga(rb5)!.estado, "vencida");
assert.equal(R.recarga(rc2)!.estado, "escuchando", "Carla siguió en la pantalla y le tocó");
assert.equal(R.recarga(rd)!.estado, "en_cola");
avanzar(61_000);
assert.equal(R.recarga(rd)!.estado, "cancelada", "Ana cerró la pantalla y salió de la cola");
// Monto declarado: se acredita por el monto aunque el nombre no se parezca.
db().prepare("UPDATE recargas SET estado = 'cancelada' WHERE estado IN ('en_cola', 'escuchando')").run();
avanzar(11 * 60_000);
const rm = R.abrirRecarga(qa, 1250);
assert.equal(R.vistaRecarga(rm)!.montoEsperado, 1250);
const otro = R.ingresarPago({ externoId: "monto-mal", monto: 1000, nombre: "Rosa Quispe", recibido: reloj, fuente: "test" });
assert.equal(otro.nuevo && otro.recargaId, null, "ni monto ni nombre: no es suyo");
const bien = R.ingresarPago({ externoId: "monto-bien", monto: 1250, nombre: "Rosa Quispe", recibido: reloj, fuente: "test" });
assert.equal(bien.nuevo && bien.recargaId, rm, "monto exacto: suyo aunque yapee otra persona");
const rm2 = R.abrirRecarga(qa, 800);
const pornombre = R.ingresarPago({ externoId: "nombre-ana", monto: 500, nombre: "Ana T. Vega", recibido: reloj, fuente: "test" });
assert.equal(pornombre.nuevo && pornombre.recargaId, null, "el monto siempre debe cuadrar, aunque el nombre sí");
R.cancelarRecarga(rm2, qa);
assert.throws(() => R.abrirRecarga(qa, 50), /al menos S\/ 1.00/);
// Pago tardío: monto exacto en los 5 minutos tras vencer el turno → suyo.
db().prepare("UPDATE recargas SET estado = 'cancelada' WHERE estado IN ('en_cola', 'escuchando')").run();
avanzar(11 * 60_000);
const rt = R.abrirRecarga(qc, 200);
avanzar(R.TURNO_MS + 21_000);
assert.equal(R.recarga(rt)!.estado, "vencida");
avanzar(30_000);
const tarde1 = R.ingresarPago({ externoId: "tardio-1", monto: 200, nombre: "Carla Men*", recibido: reloj, fuente: "test" });
assert.equal(tarde1.nuevo && tarde1.recargaId, rt, "llegó 50 s tarde con el monto exacto: suyo");
const rt2 = R.abrirRecarga(qc, 300);
avanzar(60_000 + R.TURNO_MS + 21_000);
assert.equal(R.recarga(rt2)!.estado, "vencida");
avanzar(6 * 60_000);
const tarde2 = R.ingresarPago({ externoId: "tardio-2", monto: 300, nombre: "Carla Men*", recibido: reloj, fuente: "test" });
assert.equal(tarde2.nuevo && tarde2.recargaId, null, "pasados 5 minutos ya no");
// Asignación manual del admin, sugerencia y descarte.
const libre2 = R.ingresarPago({ externoId: "suelto", monto: 300, nombre: "Alguien", recibido: reloj, fuente: "test" });
const pSuelto = db().prepare("SELECT * FROM pagos_yape WHERE id = ?").get(tarde2.nuevo ? tarde2.pagoId : 0) as R.PagoYape;
assert.equal(R.sugerenciaPara(pSuelto)?.usuarioId, qc, "sugiere a quien declaró ese monto");
const sc2 = saldo(qc);
R.asignarPago(pSuelto.id, qc, "jefe");
assert.equal(saldo(qc) - sc2, 300);
assert.throws(() => R.asignarPago(pSuelto.id, qc, "jefe"), /ya está asignado/);
R.descartarPago(libre2.nuevo ? libre2.pagoId : 0);
assert.throws(() => R.descartarPago(libre2.nuevo ? libre2.pagoId : 0), /ya está asignado o descartado/);
R.fijarRelojParaPruebas(() => Date.now());

// Saldo insuficiente.
assert.throws(() => mover(jugadores[4], -999999, "apuesta", "x"), /Saldo insuficiente/);
console.log("Todo bien: la lógica de dinero cuadra.");
