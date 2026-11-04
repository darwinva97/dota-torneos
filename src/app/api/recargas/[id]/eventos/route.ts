import { usuarioActual } from "@/lib/sesion";
import { escuchar } from "@/lib/yape/bus";
import { marcarVisto, pagosLibresDeVentana, recarga, vistaRecarga } from "@/lib/yape/recargas";

// Server-Sent Events: la pantalla de recarga se queda escuchando aquí. Recibe
// al instante cada Yape que detecta el observador y los cambios de su recarga
// (turno que empieza, acreditada, vencida), y cada 2 s su sitio en la cola.
export async function GET(_req: Request, ctx: RouteContext<"/api/recargas/[id]/eventos">) {
  const usuario = await usuarioActual();
  const { id } = await ctx.params;
  const r = recarga(Number(id));
  if (!usuario || !r || r.usuario_id !== usuario.id) {
    return new Response("no autorizado", { status: 403 });
  }

  const enc = new TextEncoder();
  let soltar = () => {};
  const stream = new ReadableStream({
    start(ctrl) {
      const enviar = (evento: string, datos: unknown) => {
        try {
          ctrl.enqueue(enc.encode(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`));
        } catch {
          soltar();
        }
      };
      // Solo se le muestran los Yapes que llegaron durante su turno.
      let enviados = new Set<number>();
      const estado = () => {
        marcarVisto(r.id);
        const vista = vistaRecarga(r.id);
        if (!vista) return;
        enviar("estado", vista);
        const actual = recarga(r.id);
        if (!actual) return;
        for (const p of pagosLibresDeVentana(actual).reverse()) {
          if (enviados.has(p.id)) continue;
          enviados = new Set(enviados).add(p.id);
          enviar("pago", { id: p.id, monto: p.monto, nombre: p.nombre, recibido: p.recibido });
        }
      };
      estado();
      const quitar = escuchar((e) => {
        if (e.tipo === "pago" || e.recargaId === r.id) estado();
      });
      // Latido: mantiene viva la conexión a través de Caddy y Cloudflare y
      // actualiza el sitio en la cola.
      const latido = setInterval(estado, 2000);
      soltar = () => {
        quitar();
        clearInterval(latido);
      };
    },
    cancel() {
      soltar();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
