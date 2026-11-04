// Prueba de la integración con Lichess contra el simulado.
// Uso: DATA_DIR=$(mktemp -d) npx tsx --conditions=react-server scripts/prueba-lichess.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { crearLichessSimulado } from "./lichess-simulado";

async function main() {
  const { servidor, estado } = crearLichessSimulado();
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const puerto = (servidor.address() as { port: number }).port;
  process.env.LICHESS_URL = `http://127.0.0.1:${puerto}`;
  process.env.LICHESS_CLAVE = crypto.randomBytes(32).toString("hex");
  const { db } = await import("../src/lib/db");
  const L = await import("../src/lib/lichess");
  const T = await import("../src/lib/torneos");
  const R = await import("../src/lib/yape/recargas");

  const conn = db();
  const nuevo = (u: string) =>
    Number(conn.prepare("INSERT INTO usuarios (usuario, nombre, nombre_yape, pass_hash) VALUES (?, ?, ?, 'x')").run(u, u, `${u} Prueba`).lastInsertRowid);
  const saldo = (id: number) => (conn.prepare("SELECT saldo FROM usuarios WHERE id = ?").get(id) as { saldo: number }).saldo;
  const [org, ana, beto, cris] = ["Org", "Ana", "Beto", "Cris"].map(nuevo);
  for (const [k, u] of [org, ana, beto, cris].entries()) {
    R.abrirRecarga(u, 2000);
    R.ingresarPago({ externoId: `l${k}`, monto: 2000, nombre: `${["Org", "Ana", "Beto", "Cris"][k]} Prueba`, recibido: Date.now(), fuente: "test" });
  }
  // OAuth completo: autorizar, canjear el código y guardar la cuenta.
  const conectar = async (id: number, login: string) => {
    const { url, verificador, estado: st } = L.empezarOAuth("http://127.0.0.1/api/lichess/callback");
    const u = new URL(url);
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("scope"), "tournament:write");
    assert.ok(!url.includes(verificador), "el verificador no viaja en la URL");
    const r = await fetch(`${url}&login=${login}`, { redirect: "manual" });
    const vuelta = new URL(r.headers.get("location")!);
    assert.equal(vuelta.searchParams.get("state"), st);
    return L.terminarOAuth(id, vuelta.searchParams.get("code")!, verificador, "http://127.0.0.1/api/lichess/callback");
  };
  assert.equal(await conectar(org, "OrgGM"), "OrgGM");
  await conectar(ana, "AnaChess");
  await conectar(beto, "BetoKnight");
  const guardado = conn.prepare("SELECT lichess_token FROM usuarios WHERE id = ?").get(ana) as { lichess_token: string };
  assert.ok(!guardado.lichess_token.startsWith("tok-"), "el token se guarda cifrado");
  await assert.rejects(conectar(cris, "AnaChess"), /ya está conectada/);

  // Validaciones al crear.
  assert.throws(() => T.crearTorneo({ organizadorId: org, nombre: "Arena rara", descripcion: "", entrada: 500, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 8, reparto: "70-30", fecha: "", premioBase: 0, sumaRecaudado: true, juego: "ajedrez", ritmo: "9+0", formato: "lichess_arena", duracion: 60 }), /no admite ese tiempo/);
  assert.throws(() => T.crearTorneo({ organizadorId: org, nombre: "Suizo", descripcion: "", entrada: 500, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 8, reparto: "70-30", fecha: "", premioBase: 0, sumaRecaudado: true, juego: "ajedrez", ritmo: "3+2", formato: "lichess_suizo" }), /equipo de Lichess/);

  // Arena: Cris no tiene Lichess y no puede inscribirse.
  const ta = T.crearTorneo({ organizadorId: org, nombre: "Arena del viernes", descripcion: "", entrada: 500, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 8, reparto: "70-30", fecha: "", premioBase: 1000, sumaRecaudado: true, juego: "ajedrez", ritmo: "blitz 3+2", formato: "lichess_arena", duracion: 60 });
  T.crearEquipo(ta, ana, "Ana");
  T.crearEquipo(ta, beto, "Beto");
  assert.throws(() => T.crearEquipo(ta, cris, "Cris"), /conecta tu cuenta de Lichess/);
  const fallos = await L.iniciarEnLichess(ta, org, false);
  assert.deepEqual(fallos, []);
  const t = T.torneo(ta)!;
  assert.equal(t.estado, "en_curso");
  const remoto = estado.torneos.get(t.lichess_id)!;
  assert.equal(remoto.creadoPor, "OrgGM", "lo crea quien organiza con su cuenta");
  assert.equal(remoto.form.clockTime, "3");
  assert.equal(remoto.form.clockIncrement, "2");
  assert.equal(remoto.form.minutes, "60");
  assert.ok(remoto.form.password, "privado con contraseña");
  assert.deepEqual(remoto.inscritos, ["AnaChess", "BetoKnight"], "inscritos solos con su cuenta");
  assert.equal(L.urlTorneo(t), `${process.env.LICHESS_URL}/tournament/${t.lichess_id}`);
  // Mientras se juega, sincronizar no reparte nada.
  assert.equal(await L.sincronizar(ta), false);
  const vivo = await L.posiciones(T.torneo(ta)!);
  assert.equal(vivo.find((p) => p.usuario === "ExtrañoGM")!.equipo, null, "quien no es de El Pozo no cuenta");
  // Termina: Beto queda 1.º y Ana 2.ª: 70/30 de 20 soles (10 de base + 2 × 5).
  remoto.terminado = true;
  const [sAna, sBeto] = [saldo(ana), saldo(beto)];
  assert.equal(await L.sincronizar(ta), true);
  assert.equal(T.torneo(ta)!.estado, "finalizado");
  assert.equal(saldo(beto) - sBeto, 1400);
  assert.equal(saldo(ana) - sAna, 600);
  assert.equal(await L.sincronizar(ta), false, "no se reparte dos veces");

  // Suizo con equipo: se crea en el equipo y las rondas mínimas son 3.
  const ts = T.crearTorneo({ organizadorId: org, nombre: "Suizo", descripcion: "", entrada: 0, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 8, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: true, juego: "ajedrez", ritmo: "rápidas 10+5", formato: "lichess_suizo", lichessEquipo: "mi-equipo", rondas: 2 });
  T.crearEquipo(ts, ana, "Ana");
  T.crearEquipo(ts, beto, "Beto");
  await L.iniciarEnLichess(ts, org, false);
  const rs = estado.torneos.get(T.torneo(ts)!.lichess_id)!;
  assert.equal(rs.tipo, "swiss");
  assert.equal(rs.form["clock.limit"], "600");
  assert.equal(rs.form.nbRounds, "3");
  // Un equipo del que no es líder: el error de Lichess llega claro.
  const ts2 = T.crearTorneo({ organizadorId: org, nombre: "Suizo 2", descripcion: "", entrada: 0, garantia: 0, limiteLlegada: "", tamEquipo: 1, maxEquipos: 8, reparto: "ganador", fecha: "", premioBase: 0, sumaRecaudado: true, juego: "ajedrez", ritmo: "3+2", formato: "lichess_suizo", lichessEquipo: "ajeno" });
  T.crearEquipo(ts2, ana, "Ana");
  T.crearEquipo(ts2, beto, "Beto");
  await assert.rejects(L.iniciarEnLichess(ts2, org, false), /Lichess respondió:.*líder/);
  assert.equal(T.torneo(ts2)!.estado, "inscripciones", "si Lichess falla, no se cierra nada");

  await L.desconectar(ana);
  assert.equal((conn.prepare("SELECT lichess_usuario FROM usuarios WHERE id = ?").get(ana) as { lichess_usuario: string }).lichess_usuario, "");
  servidor.close();
  console.log("Lichess bien: OAuth, crear, inscribir, sincronizar y repartir.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
