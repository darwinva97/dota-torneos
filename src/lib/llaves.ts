// Generación de cuadros de eliminación. Lógica pura: recibe los equipos ya
// sorteados y devuelve las partidas con sus cruces; torneos.ts las guarda.
//
// Cada partida tiene dos lados. Un lado es «fijo» (se conoce desde el sorteo:
// un equipo o un hueco vacío) o «espera» a que se juegue otra partida. Cada
// partida dice a qué partida y lado va su ganador y, en el upper, su perdedor.
//
// Los huecos (cuando no hay potencia de 2 equipos) se reparten para que nunca
// se crucen dos huecos en la primera ronda: el equipo i juega contra el i + p/2.

export type Llave = "Q" | "U" | "L" | "GF";
export type Lado = "a" | "b";
export type Hueco = { equipo: number | null } | "espera";

export type Nodo = {
  clave: string;
  llave: Llave;
  ronda: number;
  pos: number;
  a: Hueco;
  b: Hueco;
  ganador?: { clave: string; lado: Lado };
  perdedor?: { clave: string; lado: Lado };
};

const potencia = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
const clave = (llave: Llave, ronda: number, pos: number) => `${llave}${ronda}.${pos}`;

// Asientos de la primera ronda: los equipos y, al final, huecos vacíos.
function asientos(equipos: number[], tam: number): Hueco[] {
  return Array.from({ length: tam }, (_, i) => ({ equipo: equipos[i] ?? null }));
}

// Eliminación simple sobre `entradas` (potencia de 2), jugada hasta que quedan
// `quedan` ganadores. Devuelve las partidas y las claves de la última ronda.
function eliminacion(llave: Llave, entradas: Hueco[], quedan = 1) {
  const p = entradas.length;
  const nodos: Nodo[] = [];
  const rondas = Math.log2(p / quedan);
  for (let r = 1; r <= rondas; r++) {
    const partidas = p / 2 ** r;
    for (let pos = 0; pos < partidas; pos++) {
      const n: Nodo = {
        clave: clave(llave, r, pos),
        llave,
        ronda: r,
        pos,
        a: r === 1 ? entradas[pos] : "espera",
        b: r === 1 ? entradas[pos + p / 2] : "espera",
      };
      if (r < rondas) n.ganador = { clave: clave(llave, r + 1, pos >> 1), lado: pos % 2 === 0 ? "a" : "b" };
      nodos.push(n);
    }
  }
  const ultimas = nodos.filter((n) => n.ronda === rondas);
  return { nodos, ultimas };
}

// Doble eliminación (upper, lower y gran final, sin reinicio) sobre `entradas`.
function doble(entradas: Hueco[]) {
  const q = entradas.length;
  const k = Math.log2(q);
  const { nodos } = eliminacion("U", entradas);
  if (q === 2) return nodos; // con dos equipos, la final es directamente la gran final
  const upper = (r: number, pos: number) => nodos.find((n) => n.llave === "U" && n.ronda === r && n.pos === pos)!;

  const gf: Nodo = { clave: "GF1.0", llave: "GF", ronda: 1, pos: 0, a: "espera", b: "espera" };
  upper(k, 0).ganador = { clave: gf.clave, lado: "a" };

  const lower: Nodo[] = [];
  let rondaL = 1;
  const nuevo = (pos: number) => {
    const n: Nodo = { clave: clave("L", rondaL, pos), llave: "L", ronda: rondaL, pos, a: "espera", b: "espera" };
    lower.push(n);
    return n;
  };
  // L1: los perdedores de la primera ronda del upper, de dos en dos.
  let previas: Nodo[] = [];
  for (let m = 0; m < q / 4; m++) {
    const n = nuevo(m);
    upper(1, 2 * m).perdedor = { clave: n.clave, lado: "a" };
    upper(1, 2 * m + 1).perdedor = { clave: n.clave, lado: "b" };
    previas.push(n);
  }
  for (let r = 2; r <= k; r++) {
    // Ronda de caída: quien viene del lower contra quien cae del upper. Los del
    // upper caen en orden inverso para no repetir cruces pronto.
    rondaL++;
    const cuantas = previas.length;
    const caida = previas.map((prev, m) => {
      const n = nuevo(m);
      prev.ganador = { clave: n.clave, lado: "a" };
      upper(r, cuantas - 1 - m).perdedor = { clave: n.clave, lado: "b" };
      return n;
    });
    if (r === k) {
      caida[0].ganador = { clave: gf.clave, lado: "b" };
      break;
    }
    // Ronda de reducción: los ganadores de la caída, de dos en dos.
    rondaL++;
    previas = [];
    for (let m = 0; m < cuantas / 2; m++) {
      const n = nuevo(m);
      caida[2 * m].ganador = { clave: n.clave, lado: "a" };
      caida[2 * m + 1].ganador = { clave: n.clave, lado: "b" };
      previas.push(n);
    }
  }
  return [...nodos, ...lower, gf];
}

export function generarCuadro(formato: "eliminacion" | "doble" | "mixto", equipos: number[], clasifican = 8) {
  const p = potencia(equipos.length);
  if (formato === "eliminacion") return eliminacion("U", asientos(equipos, p)).nodos;
  // Pocos equipos para una fase de descarte: directo a upper y lower.
  if (formato === "doble" || equipos.length <= clasifican) return doble(asientos(equipos, p));

  // Mixto: descarte hasta quedar `clasifican`, y esos juegan upper y lower.
  const descarte = eliminacion("Q", asientos(equipos, p), clasifican);
  const playoffs = doble(Array.from({ length: clasifican }, () => "espera" as const));
  // El asiento m del upper recibe al ganador de la partida m de la última ronda
  // del descarte; la primera ronda del upper cruza el asiento m con el m + q/2.
  descarte.ultimas.forEach((n, m) => {
    const pos = m % (clasifican / 2);
    n.ganador = { clave: `U1.${pos}`, lado: m < clasifican / 2 ? "a" : "b" };
  });
  return [...descarte.nodos, ...playoffs];
}
