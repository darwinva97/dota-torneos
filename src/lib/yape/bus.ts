import "server-only";
import { EventEmitter } from "node:events";

// Bus en memoria para avisar en tiempo real a las pantallas de recarga.
// Vive en globalThis porque Next carga los route handlers y la instrumentación
// en módulos separados; así todos comparten el mismo emisor dentro del proceso.

export type EventoPago = {
  tipo: "pago";
  pago: { id: number; monto: number; nombre: string; recibido: number };
};

export type EventoRecarga = {
  tipo: "recarga";
  recargaId: number;
  estado: string;
  monto: number | null;
  nota: string;
};

type Evento = EventoPago | EventoRecarga;

const g = globalThis as unknown as { __pozoBus?: EventEmitter };
g.__pozoBus ??= new EventEmitter().setMaxListeners(500);
const bus = g.__pozoBus;

export function emitir(e: Evento) {
  bus.emit("evento", e);
}

export function escuchar(fn: (e: Evento) => void) {
  bus.on("evento", fn);
  return () => {
    bus.off("evento", fn);
  };
}
