import type { Metadata } from "next";
import { Suspense } from "react";
import { exigirAdmin } from "@/lib/sesion";
import { resumenUsuarios, retirosPendientes } from "@/lib/billetera";
import { recargasEnRevision, ultimosPagos } from "@/lib/yape/recargas";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando, Dinero, Vacio } from "@/components/ui";
import {
  accionAprobarRecarga,
  accionRechazarRecarga,
  accionResolverRetiro,
  accionSimularPago,
} from "../acciones/billetera";

export const metadata: Metadata = { title: "Admin" };

export default function Admin() {
  return (
    <>
      <h1 className="mb-8 text-5xl">Admin</h1>
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </>
  );
}

async function Contenido() {
  await exigirAdmin();
  const revision = recargasEnRevision();
  const retiros = retirosPendientes();
  const pagos = ultimosPagos();
  const usuarios = resumenUsuarios();
  const enCirculacion = usuarios.reduce((s, u) => s + u.saldo, 0);
  const simulador = process.env.YAPE_SIMULADOR === "1";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-10">
        <section>
          <h2 className="mb-4 text-3xl">Recargas por revisar</h2>
          {revision.length === 0 ? (
            <Vacio>Nada pendiente. Las recargas cuyo nombre coincide se acreditan solas.</Vacio>
          ) : (
            <ul className="space-y-4">
              {revision.map((r) => (
                <li key={r.id} className="panel grid gap-4 p-4 sm:grid-cols-[8rem_1fr]">
                  {r.comprobante ? (
                    <a href={`/api/recargas/${r.id}/comprobante`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API */}
                      <img src={`/api/recargas/${r.id}/comprobante`} alt={`Captura de ${r.usuario}`} className="w-32 rounded border border-borde" />
                    </a>
                  ) : (
                    <span className="text-sm text-niebla">Sin captura</span>
                  )}
                  <div className="space-y-2">
                    <p>
                      <span className="font-medium">{r.usuario}</span> dice que este Yape es suyo:
                    </p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
                      <dt className="text-niebla">Llegó de</dt>
                      <dd>{r.pago_nombre}</dd>
                      <dt className="text-niebla">Su nombre en Yape</dt>
                      <dd>{r.nombre_yape}</dd>
                      <dt className="text-niebla">Monto</dt>
                      <dd>
                        <Dinero centimos={r.pago_monto ?? 0} moneda={false} />
                      </dd>
                    </dl>
                    {r.pago_estado !== "libre" && (
                      <p className="text-sm text-[#e88a7f]">Ese pago ya se acreditó a otra recarga.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Formulario accion={accionAprobarRecarga}>
                        <input type="hidden" name="recarga_id" value={r.id} />
                        <input type="hidden" name="pago_id" value={r.pago_id ?? ""} />
                        <Enviar>Acreditar {soles(r.pago_monto ?? 0)}</Enviar>
                      </Formulario>
                      <Formulario accion={accionRechazarRecarga}>
                        <input type="hidden" name="recarga_id" value={r.id} />
                        <input type="hidden" name="nota" value="La captura no coincide con el Yape recibido" />
                        <Enviar variante="boton-peligro">Rechazar</Enviar>
                      </Formulario>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-3xl">Retiros pendientes</h2>
          {retiros.length === 0 ? (
            <Vacio>No hay retiros por pagar.</Vacio>
          ) : (
            <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde">
              {retiros.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-4 bg-losa px-4 py-3">
                  <div>
                    <p>
                      {r.usuario} <span className="text-niebla">({r.nombre_yape})</span>
                    </p>
                    <p className="cifra text-xl">Yapear al {r.destino}</p>
                  </div>
                  <Dinero centimos={r.monto} className="ml-auto text-2xl" />
                  <Formulario accion={accionResolverRetiro} className="flex gap-2">
                    <input type="hidden" name="retiro_id" value={r.id} />
                    <Enviar name="pagado" value="1">
                      Ya lo yapeé
                    </Enviar>
                    <Enviar name="pagado" value="0" variante="boton-peligro">
                      Rechazar
                    </Enviar>
                  </Formulario>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-3xl">Últimos Yapes recibidos</h2>
          {pagos.length === 0 ? (
            <Vacio>El observador todavía no ha reportado ningún pago.</Vacio>
          ) : (
            <table className="w-full text-left">
              <thead className="text-sm text-niebla">
                <tr>
                  <th className="py-2 font-normal">Hora</th>
                  <th className="py-2 font-normal">De</th>
                  <th className="py-2 font-normal">Acreditado a</th>
                  <th className="py-2 text-right font-normal">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 text-sm whitespace-nowrap text-niebla">
                      {new Date(p.recibido).toLocaleString("es-PE", {
                        timeZone: "America/Lima",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2">
                      {p.nombre}
                      {p.fuente === "simulador" && <span className="text-sm text-niebla"> (simulado)</span>}
                    </td>
                    <td className="py-2">{p.usuario ?? <span className="text-niebla">Sin asignar</span>}</td>
                    <td className="py-2 text-right">
                      <Dinero centimos={p.monto} moneda={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="panel p-5">
          <p className="text-niebla">Saldo total de los usuarios</p>
          <Dinero centimos={enCirculacion} className="text-4xl" />
          <p className="ayuda">Debe cuadrar con lo que hay en el Yape del pozo, menos los retiros pendientes.</p>
          <ul className="mt-4 space-y-1 text-sm">
            {usuarios.map((u) => (
              <li key={u.id} className="flex justify-between gap-2">
                <span>
                  {u.usuario}
                  {u.es_admin ? <span className="text-niebla"> (admin)</span> : null}
                </span>
                <span className="cifra">{soles(u.saldo)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-5">
          <h2 className="text-2xl">Observador de Yape</h2>
          <p className="mt-1 text-sm text-niebla">
            {process.env.YAPE_WEBHOOK_SECRET
              ? "Recibiendo los Yapes que reenvía yapi en /api/yape/yapi. La URL con el token está en .env.local del servidor."
              : "Falta YAPE_WEBHOOK_SECRET: yapi no puede entregar pagos."}
          </p>
          {simulador && (
            <Formulario accion={accionSimularPago} className="mt-4 space-y-3 border-t border-borde pt-4">
              <h3 className="text-lg">Simular un Yape</h3>
              <p className="ayuda !mt-0">Mientras no está la API real. Desactívalo quitando YAPE_SIMULADOR.</p>
              <input name="nombre" required placeholder="Juan C. Perez R." aria-label="Nombre del que yapea" className="campo" />
              <div className="flex items-center rounded-md border border-borde bg-noche focus-within:border-oro">
                <span className="pl-3 text-niebla">S/</span>
                <input name="monto" required inputMode="decimal" aria-label="Monto" placeholder="20" className="w-full bg-transparent px-2 py-2 focus:outline-none" />
              </div>
              <Enviar variante="boton-sobrio" className="w-full">
                Enviar Yape simulado
              </Enviar>
            </Formulario>
          )}
        </section>
      </aside>
    </div>
  );
}
