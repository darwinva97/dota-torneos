// Simula miles de torneos con ganadores al azar y comprueba que todo cuadro
// llega a un campeón, que en upper/lower cada eliminado pierde dos veces, que
// en liga cada par juega una vez y que en suizo nadie descansa dos veces.
// Uso: npx tsx scripts/prueba-cuadros.ts
import assert from "node:assert/strict";
import { generarCuadro, type Nodo } from "../src/lib/llaves";
import { clasificacion, rondaSuiza, rondasLiga, type Juego } from "../src/lib/puntos";

function simular(nodos: Nodo[], semilla: number) {
  let s = semilla;
  const azar = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const est = new Map(nodos.map((n) => [n.clave, { a: n.a === "espera" ? undefined : n.a.equipo, b: n.b === "espera" ? undefined : n.b.equipo, hecho: false }]));
  const derrotas = new Map<number, number>();
  let campeon: number | null | undefined, sub: number | null | undefined, jugadas = 0;
  const poner = (c: string, lado: "a" | "b", eq: number | null) => { const e = est.get(c)!; assert.equal(e[lado], undefined, `lado ${c}.${lado} ya ocupado`); e[lado] = eq; };
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const n of nodos) {
      const e = est.get(n.clave)!;
      if (e.hecho || e.a === undefined || e.b === undefined) continue;
      e.hecho = true; cambio = true;
      let g: number | null, p: number | null;
      if (e.a !== null && e.b !== null) { jugadas++; [g, p] = azar() < 0.5 ? [e.a, e.b] : [e.b, e.a]; derrotas.set(p, (derrotas.get(p) ?? 0) + 1); }
      else { g = e.a ?? e.b; p = null; }
      if (n.ganador) poner(n.ganador.clave, n.ganador.lado, g); else { campeon = g; sub = p; }
      if (n.perdedor) poner(n.perdedor.clave, n.perdedor.lado, p);
    }
  }
  assert.ok(nodos.every((n) => est.get(n.clave)!.hecho), "quedaron partidas sin jugar");
  return { campeon, sub, derrotas, jugadas };
}
let casos = 0;
for (let n = 2; n <= 20; n++) {
  const eq = Array.from({ length: n }, (_, i) => i + 1);
  for (const f of ["eliminacion", "doble", "mixto"] as const) {
    for (const cl of f === "mixto" ? [4, 8] : [8]) {
      const nodos = generarCuadro(f, eq, cl);
      assert.equal(new Set(nodos.map((x) => x.clave)).size, nodos.length);
      assert.equal(nodos.filter((x) => !x.ganador).length, 1, `${f} ${n}: una sola final`);
      for (let sem = 1; sem <= 25; sem++) {
        const r = simular(nodos, sem * 7 + n);
        casos++;
        const eliminados = eq.filter((x) => x !== r.campeon);
        assert.ok(r.campeon, `${f} ${n}: hay campeón`);
        assert.ok(r.sub, `${f} ${n}: hay subcampeón`);
        assert.ok((r.derrotas.get(r.campeon!) ?? 0) <= (f === "eliminacion" ? 0 : 1), `${f} ${n}: el campeón perdió de más`);
        if (f === "mixto" && n > cl) {
          // En el descarte se pierde una vez y fuera; en los playoffs, dos.
          const total = eliminados.reduce((s2, x) => s2 + (r.derrotas.get(x) ?? 0), 0);
          assert.ok(total >= n - 1 && total <= n - 1 + cl - 1);
        }
        if (f === "eliminacion") { assert.equal(r.jugadas, n - 1); eliminados.forEach((x) => assert.equal(r.derrotas.get(x), 1)); }
        if (f === "doble" && n > 2) {
          // Cada eliminado perdió exactamente dos veces; el campeón, como mucho una.
          eliminados.filter((x) => x !== r.sub).forEach((x) => assert.equal(r.derrotas.get(x), 2, `${n}: ${x} perdió ${r.derrotas.get(x)}`));
          assert.ok((r.derrotas.get(r.campeon!) ?? 0) <= 1);
        }
      }
    }
  }
}
// Liga: cada par juega exactamente una vez.
for (let n = 2; n <= 9; n++) {
  const eq = Array.from({ length: n }, (_, i) => i + 1);
  const pares = new Set<string>();
  for (const r of rondasLiga(eq)) for (const e of r) if (e.b !== null) { const k = [e.a, e.b].sort().join("-"); assert.ok(!pares.has(k)); pares.add(k); }
  assert.equal(pares.size, (n * (n - 1)) / 2);
}
// Suizo: sin repetir cruces en las primeras rondas y cada uno descansa como mucho una vez.
for (let n = 3; n <= 12; n++) {
  const eq = Array.from({ length: n }, (_, i) => i + 1);
  const juegos: Juego[] = [];
  const rondas = Math.ceil(Math.log2(n));
  for (let r = 1; r <= rondas; r++) {
    const ronda = rondaSuiza(eq, juegos);
    assert.equal(ronda.reduce((s, e) => s + (e.b === null ? 1 : 2), 0), n);
    for (const e of ronda) juegos.push({ ronda: r, a: e.a, b: e.b, resultado: e.b === null ? "a" : (["a", "b", "tablas"] as const)[(e.a * 7 + e.b! * 3 + r) % 3] });
  }
  const descansos = juegos.filter((j) => j.b === null).map((j) => j.a);
  assert.equal(new Set(descansos).size, descansos.length);
  const t = clasificacion(eq, juegos, "suizo");
  assert.equal(t.reduce((s, f) => s + f.puntos, 0), juegos.filter((j) => j.b !== null).length + descansos.length);
}
console.log(`Cuadros y puntos bien (${casos} torneos simulados).`);
