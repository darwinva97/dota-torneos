// Comprueba quién queda parchado contra quién. Uso: npx tsx scripts/prueba-cruces.ts
import assert from "node:assert/strict";
import { cruzar } from "../src/lib/cruces";

const j = (id: number, usuario: string, soles: number) => ({ id, usuario, monto: soles * 100, creado: "" });
// Caso real: Infravalorados 6+10 de Kanay; Aseguradores Ar1su 6, Incognito 20, Tom 6.
const r = cruzar([j(11, "Kanay", 6), j(14, "Kanay", 10)], [j(12, "Ar1su", 6), j(13, "Incognito", 20), j(15, "Tom", 6)]);
assert.deepEqual(
  r.cruces.map((c) => [c.a.usuario, c.b.usuario, c.monto / 100]),
  [["Kanay", "Incognito", 10], ["Kanay", "Ar1su", 6]],
  "más recientes primero",
);
assert.deepEqual(
  r.sinParchar.map((s) => [s.lado, s.jugada.usuario, s.monto / 100, s.parcial]),
  [["b", "Tom", 6, false], ["b", "Incognito", 10, true]],
);
// Parchada exacta: no sobra nada y lo cruzado suma lo mismo en los dos bandos.
const p = cruzar([j(1, "A", 5), j(3, "C", 5)], [j(2, "B", 10)]);
assert.equal(p.sinParchar.length, 0);
assert.equal(p.cruces.reduce((s, c) => s + c.monto, 0), 1000);
// Un bando vacío: todo sin parchar.
assert.equal(cruzar([j(1, "A", 5)], []).sinParchar[0].monto, 500);
// Al azar: lo cruzado es el mínimo de los dos bandos y lo sobrante la diferencia.
for (let k = 0; k < 500; k++) {
  const xs = Array.from({ length: 1 + (k % 5) }, (_, n) => j(n * 2 + 1, "a", 1 + ((k * 7 + n * 3) % 9)));
  const ys = Array.from({ length: 1 + (k % 4) }, (_, n) => j(n * 2 + 2, "b", 1 + ((k * 5 + n) % 11)));
  const sa = xs.reduce((s, x) => s + x.monto, 0);
  const sb = ys.reduce((s, x) => s + x.monto, 0);
  const c = cruzar(xs, ys);
  assert.equal(c.cruces.reduce((s, x) => s + x.monto, 0), Math.min(sa, sb));
  assert.equal(c.sinParchar.reduce((s, x) => s + x.monto, 0), Math.abs(sa - sb));
}
console.log("Cruces del parche bien.");
