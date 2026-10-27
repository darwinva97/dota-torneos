import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { movimientos, retirosDe, type TipoMovimiento } from "@/lib/billetera";
import { recargaAbiertaDe, recargasDe } from "@/lib/yape/recargas";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando, Dinero, Vacio } from "@/components/ui";
import { accionAbrirRecarga, accionRetiro } from "../acciones/billetera";

export const metadata: Metadata = { title: "Billetera" };

const TIPOS: Record<TipoMovimiento, string> = {
  recarga: "Recarga",
  retiro: "Retiro",
  retiro_devuelto: "Retiro devuelto",
  inscripcion: "Entrada a torneo",
  inscripcion_devuelta: "Entrada devuelta",
  garantia: "Garantía de puntualidad",
  garantia_devuelta: "Garantía devuelta",
  premio: "Premio de torneo",
  apuesta: "Apuesta",
  apuesta_ganada: "Apuesta ganada",
  apuesta_devuelta: "Apuesta devuelta",
};

const ESTADO_RECARGA: Record<string, string> = {
  escuchando: "Esperando tu Yape",
  acreditada: "Acreditada",
  revision: "En revisión",
  vencida: "Venció sin pago",
  cancelada: "Cancelada",
};

export default function Billetera() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const u = await exigirUsuario();
  const movs = movimientos(u.id);
  const abierta = recargaAbiertaDe(u.id);
  const recargas = recargasDe(u.id).filter((r) => r.estado !== "escuchando");
  const retiros = retirosDe(u.id);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-10">
        <section>
          <p className="text-niebla">Tu saldo</p>
          <Dinero centimos={u.saldo} className="text-7xl" />
        </section>

        <section>
          <h2 className="mb-3 text-3xl">Movimientos</h2>
          {movs.length === 0 ? (
            <Vacio>Aún no hay movimientos. Tu primera recarga aparecerá aquí.</Vacio>
          ) : (
            <table className="w-full text-left">
              <thead className="text-sm text-niebla">
                <tr>
                  <th className="py-2 font-normal">Fecha</th>
                  <th className="py-2 font-normal">Detalle</th>
                  <th className="py-2 text-right font-normal">Monto</th>
                  <th className="hidden py-2 pl-6 text-right font-normal sm:table-cell">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-3 text-sm whitespace-nowrap text-niebla">{fecha(m.creado)}</td>
                    <td className="py-2 pr-3">
                      <span className="block">{TIPOS[m.tipo]}</span>
                      <span className="block text-sm text-niebla">{m.detalle}</span>
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <Dinero centimos={m.monto} conSigno />
                    </td>
                    <td className="hidden py-2 pl-6 text-right text-niebla sm:table-cell">{soles(m.saldo_despues)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-lg border border-yape/70 bg-yape/15 p-5">
          <h2 className="text-2xl">Recargar con Yape</h2>
          <p className="mt-1 mb-4 text-sm text-niebla">
            Al pulsar tienes 3 minutos para yapear al número del pozo y subir la captura. En cuanto llega el Yape, se suma a tu saldo.
          </p>
          {abierta ? (
            <Link href={`/billetera/recargar?r=${abierta.id}`} className="boton w-full">
              Seguir con tu recarga
            </Link>
          ) : (
            <form action={accionAbrirRecarga}>
              <button className="boton w-full">Recargar</button>
            </form>
          )}
        </section>

        <Formulario accion={accionRetiro} className="panel space-y-4 p-5">
          <h2 className="text-2xl">Retirar</h2>
          <label className="block">
            <span className="etiqueta">Monto</span>
            <div className="flex items-center rounded-md border border-borde bg-noche focus-within:border-oro">
              <span className="pl-3 text-niebla">S/</span>
              <input name="monto" required inputMode="decimal" className="w-full bg-transparent px-2 py-2 focus:outline-none" />
            </div>
          </label>
          <label className="block">
            <span className="etiqueta">Tu celular de Yape</span>
            <input name="destino" required inputMode="numeric" placeholder="987654321" className="campo" />
          </label>
          <Enviar variante="boton-sobrio" className="w-full">
            Pedir retiro
          </Enviar>
          <p className="ayuda">Se descuenta ahora y el admin te lo yapea. Si lo rechaza, vuelve a tu saldo.</p>
        </Formulario>

        {(recargas.length > 0 || retiros.length > 0) && (
          <section className="panel p-5">
            <h2 className="mb-3 text-2xl">Solicitudes</h2>
            <ul className="space-y-2 text-sm">
              {recargas.map((r) => (
                <li key={`r${r.id}`} className="flex justify-between gap-3">
                  <span>
                    Recarga {r.monto ? soles(r.monto) : ""}
                    <span className="block text-niebla">{fecha(r.creado)}</span>
                  </span>
                  <span className={r.estado === "acreditada" ? "text-radiant" : "text-niebla"}>{ESTADO_RECARGA[r.estado]}</span>
                </li>
              ))}
              {retiros.map((r) => (
                <li key={`w${r.id}`} className="flex justify-between gap-3">
                  <span>
                    Retiro {soles(r.monto)}
                    <span className="block text-niebla">{fecha(r.creado)}</span>
                  </span>
                  <span className={r.estado === "pagado" ? "text-radiant" : "text-niebla"}>
                    {{ pendiente: "Pendiente", pagado: "Pagado", rechazado: "Rechazado" }[r.estado]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

// SQLite guarda UTC sin zona; lo mostramos en hora de Lima.
function fecha(utc: string) {
  return new Date(`${utc.replace(" ", "T")}Z`).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
