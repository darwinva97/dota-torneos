"use client";

import Link from "next/link";
import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { soles } from "@/lib/dinero";
import { accionCancelarRecarga, accionReclamar } from "../../acciones/billetera";

type Pago = { id: number; monto: number; nombre: string; recibido: number };
type EstadoVivo = { estado: string; monto: number | null; nota: string };

export function Escucha({
  recarga,
  nombreYape,
  numero,
  titular,
}: {
  recarga: { id: number; estado: string; expira: number; monto: number | null; nota: string; conCaptura: boolean };
  nombreYape: string;
  numero: string;
  titular: string;
}) {
  const router = useRouter();
  const [vivo, setVivo] = useState<EstadoVivo>(recarga);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [conectado, setConectado] = useState(false);
  const [captura, setCaptura] = useState<{ subiendo: boolean; url?: string; error?: string; lista: boolean }>({
    subiendo: false,
    lista: recarga.conCaptura,
    url: recarga.conCaptura ? `/api/recargas/${recarga.id}/comprobante` : undefined,
  });
  const restante = useRestante(recarga.expira);

  // La escucha arranca al abrir la pantalla, antes de que el usuario suba nada.
  useEffect(() => {
    if (recarga.estado !== "escuchando") return;
    const es = new EventSource(`/api/recargas/${recarga.id}/eventos`);
    es.onopen = () => setConectado(true);
    es.onerror = () => setConectado(false);
    es.addEventListener("estado", (e) => setVivo(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("pago", (e) => {
      const p = JSON.parse((e as MessageEvent).data) as Pago;
      setPagos((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
    });
    return () => es.close();
  }, [recarga.id, recarga.estado]);

  // Cuando se acredita, refrescamos el saldo de la cabecera.
  useEffect(() => {
    if (vivo.estado === "acreditada") router.refresh();
  }, [vivo.estado, router]);

  async function subir(archivo: File) {
    setCaptura((c) => ({ ...c, subiendo: true, error: undefined }));
    const fd = new FormData();
    fd.set("captura", archivo);
    const res = await fetch(`/api/recargas/${recarga.id}/comprobante`, { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setCaptura((c) => ({ ...c, subiendo: false, error: json.error ?? "No se pudo subir la captura." }));
      return;
    }
    setCaptura({ subiendo: false, lista: true, url: URL.createObjectURL(archivo) });
  }

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

  if (vivo.estado !== "escuchando") {
    const textos: Record<string, string> = {
      revision: "Le avisamos al admin. En cuanto compare tu captura con el Yape recibido, se suma a tu saldo.",
      vencida: "Pasaron los 3 minutos sin que llegara tu Yape. Si yapeaste a tiempo y no se acreditó, avísale al admin con tu captura.",
      cancelada: vivo.nota || "Esta recarga se canceló.",
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

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl">Recargar con Yape</h1>
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-niebla">
          <span className="relative flex size-3">
            {conectado && <span className="absolute inline-flex size-full animate-ping rounded-full bg-radiant opacity-60 motion-reduce:hidden" />}
            <span className={`relative inline-flex size-3 rounded-full ${conectado ? "bg-radiant" : "bg-niebla"}`} />
          </span>
          {conectado ? "Escuchando pagos" : "Conectando…"}
        </p>
      </header>

      <ol className="space-y-5">
        <li className="rounded-lg border border-yape/70 bg-yape/15 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl">Yapea al pozo</h2>
            {restante !== null && (
              <p aria-live="off" className={restante > 30 ? "text-pergamino" : "text-dire-claro"}>
                {restante > 0 ? (
                  <>
                    te quedan{" "}
                    <span className="cifra text-3xl">
                      {Math.floor(restante / 60)}:{String(restante % 60).padStart(2, "0")}
                    </span>
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
            Solo cuenta un Yape hecho después de pulsar «Recargar» y dentro de estos 3 minutos. Yapea desde la cuenta a nombre de <span className="text-pergamino">{nombreYape}</span>. Si yapeas desde otra,
            no podremos reconocerlo solos y tendrá que revisarlo el admin.
          </p>
        </li>

        <li className="panel p-5">
          <h2 className="text-2xl">Sube la captura</h2>
          <p className="mt-1 mb-3 text-sm text-niebla">
            Toma la captura de la constancia del Yape. Nos sirve de prueba si el pago no se reconoce solo.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className={`boton-sobrio cursor-pointer ${captura.subiendo ? "opacity-50" : ""}`}>
              {captura.lista ? "Cambiar captura" : "Elegir captura"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={captura.subiendo}
                onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
              />
            </label>
            {captura.subiendo && <span className="text-niebla">Subiendo…</span>}
            {captura.lista && !captura.subiendo && <span className="text-radiant">Captura guardada</span>}
            {captura.url && (
              // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API
              <img src={captura.url} alt="Tu captura de Yape" className="h-24 rounded border border-borde object-cover" />
            )}
          </div>
          {captura.error && (
            <p role="alert" className="mt-2 text-sm text-dire-claro">
              {captura.error}
            </p>
          )}
        </li>

        <li className="panel p-5">
          <h2 className="text-2xl">Espera a que llegue</h2>
          <p className="mt-1 text-sm text-niebla">
            Si llega a tu nombre, se acredita solo y esta pantalla cambia. Si ves tu pago aquí y no se acreditó (por
            ejemplo, porque yapeaste desde otra cuenta), pulsa «Es mío».
          </p>
          <ul aria-live="polite" className="mt-4 divide-y divide-borde">
            {pagos.length === 0 && <li className="py-3 text-niebla">Todavía no llegó ningún Yape.</li>}
            {pagos.map((p) => (
              <FilaPago key={p.id} p={p} recargaId={recarga.id} conCaptura={captura.lista} />
            ))}
          </ul>
        </li>
      </ol>

      <form action={accionCancelarRecarga}>
        <input type="hidden" name="recarga_id" value={recarga.id} />
        <button className="text-niebla underline underline-offset-4 hover:text-pergamino">Cancelar esta recarga</button>
      </form>
    </div>
  );
}

function FilaPago({ p, recargaId, conCaptura }: { p: Pago; recargaId: number; conCaptura: boolean }) {
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
        <button
          className="boton-sobrio px-3 py-1 text-sm"
          disabled={enviando || !conCaptura}
          title={conCaptura ? undefined : "Sube primero tu captura"}
        >
          Es mío
        </button>
      </form>
      {estado?.error && <p className="basis-full text-sm text-dire-claro">{estado.error}</p>}
    </li>
  );
}

function useRestante(expira: number) {
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
  if (ahora === null) return null;
  return Math.max(0, Math.ceil((expira - ahora) / 1000));
}
