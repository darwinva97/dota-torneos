// Juegos de los torneos. Sin «server-only»: el formulario también lo usa.

export type Juego = "dota2" | "ajedrez";

// Modalidades de ajedrez por ritmo de juego (minutos + incremento en segundos).
export const RITMOS_AJEDREZ = [
  { valor: "bala 1+0", texto: "Bala (1+0)" },
  { valor: "blitz 3+2", texto: "Blitz (3+2)" },
  { valor: "blitz 5+0", texto: "Blitz (5+0)" },
  { valor: "rápidas 10+5", texto: "Rápidas (10+5)" },
  { valor: "rápidas 15+10", texto: "Rápidas (15+10)" },
  { valor: "clásicas 30+0", texto: "Clásicas (30+0)" },
] as const;

export function nombreJuego(t: { juego: Juego; ritmo: string }) {
  return t.juego === "ajedrez" ? `Ajedrez${t.ritmo ? ` ${t.ritmo}` : ""}` : "Dota 2";
}
