// Formateo y lectura de soles. Internamente siempre céntimos.

export function soles(centimos: number) {
  const signo = centimos < 0 ? "−" : "";
  const abs = Math.abs(centimos);
  const enteros = Math.floor(abs / 100).toLocaleString("es-PE");
  const cent = String(abs % 100).padStart(2, "0");
  return `${signo}S/ ${enteros}.${cent}`;
}

// "12", "12.5", "12,50" → 1250. Devuelve null si no es un monto válido.
export function leerSoles(texto: FormDataEntryValue | null): number | null {
  if (typeof texto !== "string") return null;
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Math.round(Number(limpio) * 100);
}
