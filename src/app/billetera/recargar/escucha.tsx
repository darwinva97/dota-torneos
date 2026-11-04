"use client";

import Link from "next/link";
import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { soles } from "@/lib/dinero";
import type { VistaRecarga } from "@/lib/yape/recargas";
import { accionCancelarRecarga, accionReclamar } from "../../acciones/billetera";

type Pago = { id: number; monto: number; nombre: string; recibido: number };

export function Escucha({
  recargaId,
  inicial,
  pagosIniciales,
  nombreYape,
  numero,
  titular,
}: {
  recargaId: number;
  inicial: VistaRecarga;
  pagosIniciales: Pago[];
  nombreYape: string;
  numero: string;
  titular: string;
}) {
  const router = useRouter();
  const [vivo, setVivo] = useState<VistaRecarga>(inicial);
  const [pagos, setPagos] = useState<Pago[]>(pagosIniciales);
  const [conectado, setConectado] = useState(false);
  const ahora = useAhora();

  // La escucha arranca al abrir la pantalla, en la cola o con el turno.
  const abierta = inicial.estado === "en_cola" || inicial.estado === "escuchando";
  useEffect(() => {
    if (!abierta) return;
    const es = new EventSource(`/api/recargas/${recargaId}/eventos`);
    es.onopen = () => setConectado(true);
    es.onerror = () => setConectado(false);
    es.addEventListener("estado", (e) => setVivo(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("pago", (e) => {
      const p = JSON.parse((e as MessageEvent).data) as Pago;
      setPagos((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
    });
    return () => es.close();
  }, [recargaId, abierta]);

  // Cuando se acredita, refrescamos el saldo de la cabecera.
  useEffect(() => {
    if (vivo.estado === "acreditada") router.refresh();
  }, [vivo.estado, router]);

  if (vivo.estado === "acreditada") {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <p className="text-niebla">Llegó tu Yape</p>
        <p className="cifra animate-[aparecer_400ms_cubic-bezier(0.2,0.8,0.2,1)] text-7xl text-oro">
          +{soles(vivo.monto ?? 0)}
        </p>
        <p className="mt-2 text-niebla">{vivo.nota}. Ya está en tu saldo.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/torneos" className="boton">
            Ir a los torneos
          </Link>
          <Link href="/billetera" className="boton-sobrio">
            Ver billetera
          </Link>
        </div>
        <style>{`@keyframes aparecer { from { opacity: 0; transform: scale(0.92) } to { opacity: 1; transform: none } }`}</style>
      </div>
    );
  }

  const vencidaConPagos = vivo.estado === "vencida" && pagos.length > 0;

  if (vivo.estado !== "escuchando" && vivo.estado !== "en_cola" && !vencidaConPagos) {
    const textos: Record<string, string> = {
      revision: "Le avisamos al admin. En cuanto revise el Yape recibido, se suma a tu saldo.",
      vencida:
        "Se acabó tu turno sin que llegara tu Yape. Si vuelves a intentarlo en los próximos 10 minutos, tu turno empezará tras 1 minuto de espera.",
      cancelada: vivo.nota || "Cancelaste esta recarga.",
    };
    return (
      <div className="mx-auto max-w-lg py-10">
        <h1 className="text-4xl">{vivo.estado === "revision" ? "En revisión" : "Recarga cerrada"}</h1>
        <p className="mt-3 text-niebla">{textos[vivo.estado]}</p>
        <Link href="/billetera" className="boton-sobrio mt-6">
          Volver a la billetera
        </Link>
      </div>
    );
  }

  const cancelar = (
    <form action={accionCancelarRecarga}>
      <input type="hidden" name="recarga_id" value={recargaId} />
      <button className="text-niebla underline underline-offset-4 hover:text-pergamino">
        {vivo.estado === "en_cola" ? "Salir de la cola" : "Cancelar esta recarga"}
      </button>
    </form>
  );

  const encabezado = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-5xl">Recargar con Yape</h1>
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-niebla">
        <span className="relative flex size-3">
          {conectado && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-radiant opacity-60 motion-reduce:hidden" />
          )}
          <span className={`relative inline-flex size-3 rounded-full ${conectado ? "bg-radiant" : "bg-niebla"}`} />
        </span>
        {!conectado ? "Conectando…" : vivo.estado === "en_cola" ? "En la cola" : "Escuchando pagos"}
      </p>
    </header>
  );

  if (vivo.estado === "en_cola") {
    const penalizado = ahora !== null && vivo.disponibleDesde > ahora;
    const falta = ahora === null ? null : Math.max(0, Math.ceil((vivo.empiezaHacia - ahora) / 1000));
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        {encabezado}
        <section className="panel hud space-y-4 p-6 text-center">
          {vivo.delante > 0 ? (
            <>
              <p className="text-niebla">Hay otra persona recargando. Delante de ti:</p>
              <p className="cifra text-7xl text-oro">{vivo.delante}</p>
            </>
          ) : (
            <p className="cifra text-3xl text-oro">Eres el siguiente</p>
          )}
          {falta !== null && falta > 0 && (
            <p className="text-niebla">
              Tu turno empieza en <span className="cifra text-2xl text-pergamino">{reloj(falta)}</span>
              {vivo.delante > 0 ? " como mucho" : ""}
            </p>
          )}
          {penalizado && (
            <p className="rounded-md bg-dire/10 px-3 py-2 text-sm text-dire-claro">
              Tu último turno terminó sin yapear, así que esperas 1 minuto antes de empezar. Si alguien llega mientras
              tanto, recarga antes que tú.
            </p>
          )}
          <p className="text-sm text-niebla">
            Solo una persona recarga a la vez para reconocer bien cada Yape. Deja esta pantalla abierta: cuando empiece tu
            turno tendrás 30 segundos para yapear{vivo.montoEsperado ? ` ${soles(vivo.montoEsperado)}` : ""}. <strong className="text-pergamino">No yapees todavía.</strong>
          </p>
        </section>
        {cancelar}
      </div>
    );
  }

  // Acotado a la duración del turno por si los relojes del celular y del servidor difieren.
  const restante =
    ahora === null ? null : Math.min(vivo.expira - vivo.inicio, Math.max(0, vivo.expira - ahora)) / 1000 | 0;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {encabezado}
      <ol className="space-y-5">
        {vencidaConPagos ? (
          <li role="alert" className="rounded-lg border border-oro/50 bg-oro/10 p-5">
            <h2 className="text-2xl">Se acabó tu turno</h2>
            <p className="mt-1 text-niebla">
              Llegó un Yape durante tu turno pero no lo reconocimos solos. Si es tuyo, pulsa «Es mío»: el admin lo revisa
              y te lo acredita.
            </p>
          </li>
        ) : (
          <li className="rounded-lg border border-yape/70 bg-yape/15 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-2xl">
                Es tu turno: yapea {vivo.montoEsperado ? <span className="cifra text-oro">{soles(vivo.montoEsperado)}</span> : "al pozo"}
              </h2>
              {restante !== null && (
                <p aria-live="off" className={restante > 20 ? "text-pergamino" : "text-dire-claro"}>
                  {restante > 0 ? (
                    <>
                      te quedan <span className="cifra text-3xl">{reloj(restante)}</span>
                    </>
                  ) : (
                    "Se acabó el tiempo. Si ya yapeaste, espera unos segundos a que llegue."
                  )}
                </p>
              )}
            </div>
            {numero ? (
              <>
                <p className="cifra mt-2 text-5xl tracking-wide">{numero.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}</p>
                {titular && <p className="text-niebla">a nombre de {titular}</p>}
              </>
            ) : (
              <p className="mt-2 text-niebla">El admin todavía no configuró el número del pozo. Pídeselo por el grupo.</p>
            )}
            <p className="mt-3 text-sm text-niebla">
              Durante tu turno nadie más puede recargar.{" "}
              {vivo.montoEsperado
                ? `Lo reconocemos por el monto: yapea exactamente ${soles(vivo.montoEsperado)}, desde la cuenta que quieras.`
                : `Yapea desde la cuenta a nombre de ${nombreYape} para que lo reconozcamos solos.`}
            </p>
          </li>
        )}

        <li className="panel p-5">
          <h2 className="text-2xl">Espera a que llegue</h2>
          <p className="mt-1 text-sm text-niebla">
            Si llega por el monto que dijiste, se acredita solo y esta pantalla cambia. Si ves tu pago aquí y no se
            acreditó (por ejemplo, porque yapeaste otro monto), pulsa «Es mío» y lo revisa el admin.
          </p>
          <ul aria-live="polite" className="mt-4 divide-y divide-borde">
            {pagos.length === 0 && <li className="py-3 text-niebla">Todavía no llegó ningún Yape.</li>}
            {pagos.map((p) => (
              <FilaPago key={p.id} p={p} recargaId={recargaId} />
            ))}
          </ul>
        </li>
      </ol>
      {vivo.estado === "escuchando" && cancelar}
    </div>
  );
}

function reloj(segundos: number) {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

function FilaPago({ p, recargaId }: { p: Pago; recargaId: number }) {
  const [estado, despachar, enviando] = useActionState(accionReclamar, null);
  const hora = new Date(p.recibido).toLocaleTimeString("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <span className="cifra text-2xl text-oro">{soles(p.monto)}</span>
      <span>{p.nombre}</span>
      <span className="text-sm text-niebla">{hora}</span>
      <form action={despachar} className="ml-auto">
        <input type="hidden" name="recarga_id" value={recargaId} />
        <input type="hidden" name="pago_id" value={p.id} />
        <button className="boton-sobrio px-3 py-1 text-sm" disabled={enviando || estado?.ok !== undefined}>
          Es mío
        </button>
      </form>
      {estado?.error && <p className="basis-full text-sm text-dire-claro">{estado.error}</p>}
      {estado?.ok && <p className="basis-full text-sm text-radiant">{estado.ok}</p>}
    </li>
  );
}

// Hora actual, tic cada segundo. null en el primer render para no desajustar
// el HTML del servidor con el del navegador.
function useAhora() {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const tic = () => setAhora(Date.now());
    const primero = setTimeout(tic, 0);
    const cada = setInterval(tic, 1000);
    return () => {
      clearTimeout(primero);
      clearInterval(cada);
    };
  }, []);
  return ahora;
}
