import { usuarioActual } from "@/lib/sesion";
import { escuchar } from "@/lib/yape/bus";
import { pagosLibresRecientes, recarga } from "@/lib/yape/recargas";

// Server-Sent Events: la pantalla de recarga se queda escuchando aquí y recibe
// al instante cada Yape que detecta el observador y el cambio de estado de su
// propia recarga.
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
      enviar("estado", { estado: r.estado, monto: r.monto, nota: r.nota, expira: r.expira });
      for (const p of pagosLibresRecientes(r.inicio).reverse()) {
        enviar("pago", { id: p.id, monto: p.monto, nombre: p.nombre, recibido: p.recibido });
      }

      const quitar = escuchar((e) => {
        if (e.tipo === "pago") enviar("pago", e.pago);
        else if (e.recargaId === r.id) enviar("estado", { estado: e.estado, monto: e.monto, nota: e.nota });
      });
      // Latido para que Caddy/Cloudflare no corten la conexión, y para vencer
      // la recarga cuando se acaba la ventana.
      const latido = setInterval(() => {
        const actual = recarga(r.id);
        if (actual && actual.estado === "vencida") enviar("estado", { estado: "vencida", monto: null, nota: "" });
        else enviar("latido", Date.now());
      }, 15_000);
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
