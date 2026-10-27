import Link from "next/link";
import { Suspense } from "react";
import { HandCoins } from "lucide-react";
import { usuarioActual } from "@/lib/sesion";
import { deudaPendiente, type DeudaConNombres } from "@/lib/billetera";
import { soles } from "@/lib/dinero";
import { Estado, fecha } from "./ui";

// Aviso fijo arriba de cada página mientras el jugador tenga deudas.
export function AvisoDeuda() {
  return (
    <Suspense fallback={null}>
      <AvisoConDatos />
    </Suspense>
  );
}

async function AvisoConDatos() {
  const u = await usuarioActual();
  const debe = u ? deudaPendiente(u.id) : 0;
  if (!debe) return null;
  return (
    <div role="alert" className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border border-dire/50 bg-dire/10 px-4 py-3">
      <HandCoins className="size-6 shrink-0 text-dire-claro" aria-hidden />
      <p className="min-w-0 flex-1">
        Tienes una deuda de <span className="cifra text-dire-claro">{soles(debe)}</span>. Lo que recargues o ganes se usa
        primero para pagarla, y hasta saldarla no puedes inscribirte, apostar ni retirar.
      </p>
      <Link href="/billetera#deudas" className="boton-sobrio py-1.5 text-sm">
        Ver detalle
      </Link>
    </div>
  );
}

export function BarraDeuda({ d }: { d: DeudaConNombres }) {
  const parte = Math.round((d.pagado / d.monto) * 100);
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-radiant" style={{ width: `${parte}%` }} />
      </div>
      <p className="mt-1 text-sm text-niebla">
        Pagado {soles(d.pagado)} de {soles(d.monto)}
      </p>
    </div>
  );
}

const ESTADO_DEUDA: Record<DeudaConNombres["estado"], [string, string]> = {
  pendiente: ["rechazado", "Pendiente"],
  pagada: ["pagado", "Pagada"],
  perdonada: ["anulado", "Perdonada"],
};

export function FilaDeuda({ d, yo, children }: { d: DeudaConNombres; yo?: number; children?: React.ReactNode }) {
  const [clave, texto] = ESTADO_DEUDA[d.estado];
  const quien =
    yo === undefined
      ? `${d.deudor} le debe a ${d.acreedor}`
      : d.deudor_id === yo
        ? `Le debes a ${d.acreedor}`
        : `${d.deudor} te debe`;
  return (
    <li className="panel space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="cifra text-xl">{soles(d.monto)}</span>
        <span>{quien}</span>
        <span className="ml-auto">
          <Estado estado={clave} texto={texto} />
        </span>
      </div>
      <p className="text-sm text-niebla">
        {d.motivo}. Asignada el {fecha(d.creado)}
        {d.resuelto ? `, cerrada el ${fecha(d.resuelto)}` : ""}
      </p>
      {d.estado === "pendiente" && <BarraDeuda d={d} />}
      {children}
    </li>
  );
}
