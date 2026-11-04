// Formatos de torneo. Sin «server-only»: el formulario de creación también los usa.

import type { Juego } from "./juegos";

export type Formato =
  | "eliminacion" // por descarte: quien pierde, fuera
  | "doble" // upper y lower bracket, como en The International
  | "mixto" // descarte hasta quedar N y luego upper y lower
  | "liga" // todos contra todos
  | "suizo" // rondas emparejando a quienes van igual
  | "lichess_arena" // Arena jugado en Lichess
  | "lichess_suizo"; // Suizo jugado en Lichess

export type InfoFormato = { valor: Formato; texto: string; detalle: string };

export const FORMATOS: Record<Juego, InfoFormato[]> = {
  dota2: [
    {
      valor: "eliminacion",
      texto: "Por descarte",
      detalle: "Eliminación directa: quien pierde una partida queda fuera.",
    },
    {
      valor: "doble",
      texto: "Upper y lower bracket",
      detalle: "Como en The International: quien pierde en el upper baja al lower y tiene otra oportunidad.",
    },
    {
      valor: "mixto",
      texto: "Descarte + upper y lower",
      detalle: "Para muchos equipos: primero por descarte hasta quedar 4 u 8, y esos juegan upper y lower.",
    },
  ],
  ajedrez: [
    { valor: "eliminacion", texto: "Eliminación", detalle: "Quien pierde queda fuera; las tablas se desempatan." },
    { valor: "liga", texto: "Todos contra todos", detalle: "Round robin: cada jugador juega contra todos los demás." },
    { valor: "suizo", texto: "Suizo", detalle: "Varias rondas emparejando a quienes llevan los mismos puntos." },
    {
      valor: "lichess_arena",
      texto: "Arena en Lichess",
      detalle: "Se crea en Lichess y se juega allí durante un tiempo fijo; inscribimos a todos solos.",
    },
    {
      valor: "lichess_suizo",
      texto: "Suizo en Lichess",
      detalle: "Suizo jugado en Lichess. Necesita un equipo de Lichess del que seas líder.",
    },
  ],
};

export function esLichess(f: Formato) {
  return f === "lichess_arena" || f === "lichess_suizo";
}

// Formatos con tabla de posiciones (puntos) en vez de cuadro.
export function esPorPuntos(f: Formato) {
  return f === "liga" || f === "suizo" || esLichess(f);
}

export function nombreFormato(juego: Juego, f: Formato) {
  return FORMATOS[juego].find((x) => x.valor === f)?.texto ?? f;
}

// Rondas recomendadas en un suizo: las justas para que haya un único ganador.
export function rondasSuizo(jugadores: number) {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, jugadores))));
}

// Duraciones de Arena que admite Lichess (minutos).
export const DURACIONES_ARENA = [20, 30, 45, 60, 90, 120];

// «blitz 3+2» → { minutos: 3, incremento: 2 }.
export function leerRitmo(ritmo: string) {
  const m = /(\d+(?:\.\d+)?)\s*\+\s*(\d+)/.exec(ritmo);
  return m ? { minutos: Number(m[1]), incremento: Number(m[2]) } : null;
}

// Valida el ritmo para Lichess al crear el torneo, para no descubrirlo al final.
// Devuelve el problema, o null si vale.
const MINUTOS_ARENA = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50, 60];
const INCREMENTOS_ARENA = [0, 1, 2, 3, 4, 5, 6, 7, 10, 15, 20, 25, 30, 40, 50, 60];
export function problemaRitmoLichess(formato: string, ritmo: string, duracion: number): string | null {
  const r = leerRitmo(ritmo);
  if (!r) return "Para Lichess escribe el ritmo como minutos+incremento, por ejemplo 3+2.";
  if (formato === "lichess_arena") {
    if (!MINUTOS_ARENA.includes(r.minutos)) return "Lichess no admite ese tiempo en Arena. Usa 1, 2, 3, 5, 10, 15…";
    if (!INCREMENTOS_ARENA.includes(r.incremento)) return "Lichess no admite ese incremento en Arena (0 a 7, 10, 15…).";
    // Regla de Lichess: el reloj tiene que caber varias veces en la duración.
    const razon = (duracion * 60) / (96 * r.minutos + 48 * r.incremento + 15);
    if (razon < 3 || razon > 150) return "Con ese ritmo la Arena es demasiado corta o demasiado larga para Lichess.";
  }
  return null;
}
