import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { exigirUsuario } from "@/lib/sesion";
import { retirosDe, type Retiro } from "@/lib/billetera";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando, Estado, Titulo, Vacio, fecha } from "@/components/ui";
import { accionCancelarRetiro } from "../../acciones/billetera";
import { FormularioRetiro } from "./formulario";

export const metadata: Metadata = { title: "Retirar" };

export default function Retirar() {
  return (
    <>
      <Link href="/billetera" className="mb-4 inline-flex items-center gap-1.5 text-niebla hover:text-pergamino">
        <ArrowLeft className="size-4" aria-hidden /> Billetera
      </Link>
      <Titulo sub="Pides el retiro, al admin le llega la solicitud y te lo yapea. Aquí ves en qué va cada una.">
        Retirar a Yape
      </Titulo>
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </>
  );
}

async function Contenido() {
  const u = await exigirUsuario();
  const retiros = retirosDe(u.id);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[26rem_1fr]">
      <FormularioRetiro saldo={u.saldo} ultimoDestino={retiros[0]?.destino ?? ""} />
      <section>
        <h2 className="mb-4 text-2xl">Tus solicitudes</h2>
        {retiros.length === 0 ? (
          <Vacio>Todavía no has pedido ningún retiro.</Vacio>
        ) : (
          <ul className="space-y-3">
            {retiros.map((r) => (
              <TarjetaRetiro key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Cada solicitud muestra su recorrido: pedida y luego pagada, rechazada o cancelada.
function TarjetaRetiro({ r }: { r: Retiro }) {
  const fin = {
    pendiente: { Icono: Hourglass, texto: "El admin aún no la paga", clase: "text-oro" },
    pagado: {
      Icono: CheckCircle2,
      texto: `Te lo yapeó${r.resuelto ? ` el ${fecha(r.resuelto)}` : ""}${r.operacion ? `. Operación ${r.operacion}` : ""}`,
      clase: "text-radiant",
    },
    rechazado: {
      Icono: XCircle,
      texto: `Rechazada: ${r.nota || "sin motivo"}. El monto volvió a tu saldo.`,
      clase: "text-dire-claro",
    },
    cancelado: { Icono: XCircle, texto: "La cancelaste. El monto volvió a tu saldo.", clase: "text-niebla" },
  }[r.estado];
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="cifra text-2xl">{soles(r.monto)}</span>
        <span className="text-niebla">al {r.destino}</span>
        <span className="ml-auto">
          <Estado estado={r.estado} texto={r.estado === "cancelado" ? "Cancelado" : undefined} />
        </span>
      </div>
      <ol className="mt-3 space-y-1.5 border-l border-white/10 pl-4 text-sm">
        <li className="text-niebla">Pedida el {fecha(r.creado)}</li>
        <li className={`flex items-start gap-1.5 ${fin.clase}`}>
          <fin.Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
          {fin.texto}
        </li>
      </ol>
      {r.estado === "pendiente" && (
        <Formulario accion={accionCancelarRetiro} confirmar="¿Cancelar este retiro? El monto vuelve a tu saldo." className="mt-3">
          <input type="hidden" name="retiro_id" value={r.id} />
          <Enviar variante="boton-sobrio" className="px-3 py-1 text-sm">
            Cancelar solicitud
          </Enviar>
        </Formulario>
      )}
    </li>
  );
}
