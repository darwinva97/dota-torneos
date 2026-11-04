// Formatos por puntos (liga y suizo): emparejamientos y clasificación.
// Lógica pura; torneos.ts guarda las partidas.
//
// Puntos de ajedrez: victoria 1, tablas ½, derrota 0, descanso (bye) 1.

export type Resultado = "a" | "b" | "tablas";
export type Juego = { ronda: number; a: number; b: number | null; resultado: Resultado | null };
export type Emparejamiento = { a: number; b: number | null };

// Todos contra todos por el método del círculo (tablas de Berger). Con número
// impar de jugadores, uno descansa cada ronda. Los colores se alternan.
export function rondasLiga(jugadores: number[]): Emparejamiento[][] {
  const lista: (number | null)[] = [...jugadores];
  if (lista.length % 2) lista.push(null);
  const n = lista.length;
  const rondas: Emparejamiento[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const ronda: Emparejamiento[] = [];
    for (let i = 0; i < n / 2; i++) {
      let x = lista[i];
      let y = lista[n - 1 - i];
      // Alterna colores: en rondas impares el primero juega con negras.
      if ((i === 0 && r % 2 === 1) || (i > 0 && i % 2 === 1)) [x, y] = [y, x];
      if (x === null) [x, y] = [y, x];
      ronda.push({ a: x!, b: y });
    }
    rondas.push(ronda);
    // Rota todos menos el primero.
    lista.splice(1, 0, lista.pop()!);
  }
  return rondas;
}

export type Fila = {
  jugador: number;
  puntos: number;
  desempate: number;
  ganadas: number;
  tablas: number;
  perdidas: number;
  jugadas: number;
};

function puntosDe(jugador: number, j: Juego) {
  if (j.resultado === null) return null;
  if (j.b === null) return 1; // descanso
  if (j.resultado === "tablas") return 0.5;
  return (j.resultado === "a") === (j.a === jugador) ? 1 : 0;
}

// Clasificación ordenada. Desempate: Buchholz en suizo (suma de los puntos de
// los rivales) y Sonneborn-Berger en liga (puntos de los rivales a los que
// ganó, más la mitad de aquellos con los que hizo tablas).
export function clasificacion(jugadores: number[], juegos: Juego[], sistema: "liga" | "suizo"): Fila[] {
  const filas = new Map<number, Fila>(
    jugadores.map((j) => [j, { jugador: j, puntos: 0, desempate: 0, ganadas: 0, tablas: 0, perdidas: 0, jugadas: 0 }]),
  );
  for (const j of juegos) {
    for (const yo of [j.a, j.b]) {
      if (yo === null) continue;
      const f = filas.get(yo);
      const p = puntosDe(yo, j);
      if (!f || p === null) continue;
      f.puntos += p;
      f.jugadas++;
      if (j.b !== null) {
        if (p === 1) f.ganadas++;
        else if (p === 0.5) f.tablas++;
        else f.perdidas++;
      }
    }
  }
  for (const f of filas.values()) {
    let d = 0;
    for (const j of juegos) {
      if (j.resultado === null || j.b === null || (j.a !== f.jugador && j.b !== f.jugador)) continue;
      const rival = j.a === f.jugador ? j.b : j.a;
      const puntosRival = filas.get(rival)?.puntos ?? 0;
      if (sistema === "suizo") d += puntosRival;
      else d += puntosRival * (puntosDe(f.jugador, j) ?? 0);
    }
    f.desempate = d;
  }
  return [...filas.values()].sort(
    (x, y) => y.puntos - x.puntos || y.desempate - x.desempate || y.ganadas - x.ganadas,
  );
}

// Siguiente ronda de un suizo: se ordena por puntos y se empareja de arriba
// abajo con el primero contra quien aún no se haya jugado. Si el número es
// impar, descansa (1 punto) el peor clasificado que todavía no descansó.
export function rondaSuiza(jugadores: number[], juegos: Juego[]): Emparejamiento[] {
  const tabla = clasificacion(jugadores, juegos, "suizo");
  const orden = tabla.map((f) => f.jugador);
  const jugaron = (x: number, y: number) =>
    juegos.some((j) => (j.a === x && j.b === y) || (j.a === y && j.b === x));
  const blancas = (x: number) => juegos.filter((j) => j.a === x && j.b !== null).length;
  const negras = (x: number) => juegos.filter((j) => j.b === x).length;

  const ronda: Emparejamiento[] = [];
  const libres = [...orden];
  if (libres.length % 2) {
    const descansaron = new Set(juegos.filter((j) => j.b === null).map((j) => j.a));
    const i = [...libres].reverse().findIndex((x) => !descansaron.has(x));
    const quien = libres.splice(i === -1 ? libres.length - 1 : libres.length - 1 - i, 1)[0];
    ronda.push({ a: quien, b: null });
  }
  while (libres.length) {
    const x = libres.shift()!;
    let i = libres.findIndex((y) => !jugaron(x, y));
    if (i === -1) i = 0; // todos repetidos: se acepta la revancha
    const y = libres.splice(i, 1)[0];
    // Blancas para quien ha tenido menos.
    const xBlancas = blancas(x) - negras(x) <= blancas(y) - negras(y);
    ronda.push(xBlancas ? { a: x, b: y } : { a: y, b: x });
  }
  return ronda;
}
