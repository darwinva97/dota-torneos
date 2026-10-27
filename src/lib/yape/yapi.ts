import "server-only";
import crypto from "node:crypto";
import type { PagoEntrante } from "./recargas";

// Observador real: yapi (github.com/darwinva97/yapi). La app de yapi en el
// celular del pozo lee las notificaciones de Yape y las sube a su worker; un
// canal de yapi con la app de Yape y una integración apuntando a
// /api/yape/yapi?token=… nos reenvía cada una con este cuerpo (resumido):
//
//   { event: "channel.notification.created", deliveredAt,
//     notification: { id, title, description, sourceApp, timestamp },
//     source: { kind: "ingest", postedAt, package, ... } }
//
// yapi no interpreta el texto, así que el nombre y el monto los sacamos aquí.

export type CuerpoYapi = {
  event?: string;
  deliveredAt?: string;
  notification?: { id?: string; title?: string; description?: string; timestamp?: string };
  source?: { kind?: string; postedAt?: string | null; package?: string };
};

// Texto típico de Yape al recibir: «Yape! Juan C. Perez R. te envió un pago por
// S/ 20. El cód. de seguridad es: 123». También aceptamos «te yapeó S/ 20».
const PATRON =
  /(?:yape!?\s*)?([^\n]+?)\s+te\s+(?:envi[oó]\s+un\s+pago\s+por|yape[oó])\s+S\/\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;

export function leerNotificacionYape(titulo: string, texto: string) {
  for (const candidato of [texto, `${titulo} ${texto}`]) {
    const m = PATRON.exec(candidato.replace(/\s+/g, " "));
    if (!m) continue;
    const monto = Math.round(Number(m[2].replace(/,/g, "")) * 100);
    const nombre = m[1].replace(/^yape!?\s*/i, "").trim();
    if (monto > 0 && nombre) return { nombre, monto };
  }
  return null;
}

export function pagoDesdeYapi(c: CuerpoYapi): PagoEntrante | null {
  const n = c.notification;
  if (!n) return null;
  const leido = leerNotificacionYape(n.title ?? "", n.description ?? "");
  if (!leido) return null;
  // Android a veces vuelve a publicar la misma notificación y yapi le pone un id
  // nuevo cada vez. Por eso el id externo sale del contenido: mismo texto en el
  // mismo minuto es el mismo Yape.
  const recibido = Date.parse(c.source?.postedAt ?? c.deliveredAt ?? n.timestamp ?? "") || Date.now();
  const minuto = Math.floor(recibido / 60_000);
  const huella = crypto
    .createHash("sha256")
    .update(`${n.title}|${n.description}|${minuto}`)
    .digest("hex")
    .slice(0, 32);
  return { externoId: `yapi:${huella}`, ...leido, recibido, fuente: "yapi", crudo: { notification: n, source: c.source } };
}
