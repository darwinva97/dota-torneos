// Error que se puede enseñar tal cual al usuario. Cualquier otro error se
// registra en el servidor y se muestra un mensaje genérico.
export class ErrorUsuario extends Error {}

export type Estado = { error?: string; ok?: string } | null;

export function aEstado(e: unknown): Estado {
  if (e instanceof ErrorUsuario) return { error: e.message };
  console.error(e);
  return { error: "Algo falló en el servidor. Vuelve a intentarlo." };
}

export function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorUsuario(mensaje);
}
