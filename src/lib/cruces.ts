// Quién está parchado contra quién en una apuesta 1 a 1. Lógica pura.
//
// En cada bando las jugadas van por orden de llegada y se cruzan la más
// antigua de un bando con la más antigua del otro, partiendo una jugada en
// trozos si hace falta. Lo que queda sin rival al final del bando que puso de
// más es lo «sin parchar»: justo lo que se devuelve al igualar o al bloquear,
// que empieza por las últimas jugadas.

export type JugadaCruce = { id: number; usuario: string; monto: number; creado: string };

export type Cruce = {
  monto: number;
  a: JugadaCruce;
  b: JugadaCruce;
};

export type SinParchar = { lado: "a" | "b"; jugada: JugadaCruce; monto: number; parcial: boolean };

export function cruzar(bandoA: JugadaCruce[], bandoB: JugadaCruce[]) {
  const orden = (xs: JugadaCruce[]) => [...xs].sort((x, y) => x.id - y.id);
  const a = orden(bandoA);
  const b = orden(bandoB);
  const cruces: Cruce[] = [];
  let i = 0;
  let j = 0;
  let restoA = a[0]?.monto ?? 0;
  let restoB = b[0]?.monto ?? 0;
  while (i < a.length && j < b.length) {
    const monto = Math.min(restoA, restoB);
    cruces.push({ monto, a: a[i], b: b[j] });
    restoA -= monto;
    restoB -= monto;
    if (restoA === 0) restoA = a[++i]?.monto ?? 0;
    if (restoB === 0) restoB = b[++j]?.monto ?? 0;
  }
  // Lo que sobra: el resto de la jugada a medias y las que no llegaron a cruzarse.
  const sobra = (lado: "a" | "b", xs: JugadaCruce[], k: number, resto: number): SinParchar[] =>
    xs.slice(k).map((jugada, n) => ({
      lado,
      jugada,
      monto: n === 0 ? resto : jugada.monto,
      parcial: n === 0 && resto < jugada.monto,
    }));
  const sinParchar = [...sobra("a", a, i, restoA), ...sobra("b", b, j, restoB)];
  // De lo más reciente a lo más antiguo.
  return {
    sinParchar: sinParchar.reverse(),
    cruces: cruces.reverse(),
  };
}
