import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { jugadasDe, mercado, opcionesDe } from "@/lib/mercados";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando, Dinero, Estado } from "@/components/ui";
import { accionAnular, accionApostar, accionCerrarApuesta, accionResolver } from "../../acciones/apuestas";

export default function PaginaApuesta({ params }: PageProps<"/apuestas/[id]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: PageProps<"/apuestas/[id]">["params"] }) {
  const u = await exigirUsuario();
  const m = mercado(Number((await params).id));
  if (!m) notFound();
  const opciones = opcionesDe(m.id);
  const jugadas = jugadasDe(m.id);
  const mias = jugadas.filter((j) => j.usuario_id === u.id);
  const miOpcion = mias[0]?.opcion_id;
  const puesto = mias.reduce((s, j) => s + j.monto, 0);
  const cobrado = mias.reduce((s, j) => s + (j.pago ?? 0), 0);
  const gestiona = !!u.es_admin || (m.creador_id === u.id && !m.torneo_id);
  const viva = m.estado === "abierto" || m.estado === "cerrado";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <header>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Estado estado={m.estado} />
            {m.torneo_id && (
              <Link href={`/torneos/${m.torneo_id}`} className="text-sm text-niebla underline underline-offset-4 hover:text-pergamino">
                Ver torneo
              </Link>
            )}
          </div>
          <h1 className="text-4xl sm:text-5xl">{m.titulo}</h1>
          <p className="mt-2 text-niebla">
            Propuesta por {m.creador}.{" "}
            {m.torneo_id ? "Se resuelve sola con el resultado del torneo." : `La resuelve ${m.creador}.`}
          </p>
          {m.descripcion && <p className="mt-3 max-w-[64ch] whitespace-pre-line">{m.descripcion}</p>}
        </header>

        <section aria-label="Opciones" className="space-y-3">
          {opciones.map((o) => {
            const parte = m.pozo > 0 ? o.total / m.pozo : 0;
            const cuota = o.total > 0 ? m.pozo / o.total : null;
            const gano = m.opcion_ganadora === o.id && m.estado === "resuelto";
            return (
              <div
                key={o.id}
                className={`panel relative overflow-hidden p-4 ${gano ? "border-radiant" : ""} ${
                  miOpcion === o.id ? "ring-1 ring-oro/60" : ""
                }`}
              >
                <div
                  aria-hidden
                  className={`absolute inset-y-0 left-0 ${gano ? "bg-radiant/15" : "bg-oro/10"}`}
                  style={{ width: `${Math.round(parte * 100)}%` }}
                />
                <div className="relative flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="cifra text-2xl">{o.etiqueta}</span>
                  {gano && <span className="text-radiant">Ganó</span>}
                  {miOpcion === o.id && <span className="text-sm text-oro">Tu opción</span>}
                  <span className="ml-auto text-niebla">
                    {o.jugadores} {o.jugadores === 1 ? "persona" : "personas"}
                  </span>
                  <Dinero centimos={o.total} className="text-2xl" />
                </div>
                {m.estado === "abierto" && (
                <p className="relative mt-1 text-sm text-niebla">
                  {cuota
                    ? `Si gana, cada sol apostado aquí cobra ${soles(Math.floor(cuota * 100))} con el pozo actual.`
                    : "Nadie ha apostado por esta todavía."}
                </p>
                )}
              </div>
            );
          })}
          <p className="flex items-baseline justify-end gap-3 text-niebla">
            Pozo total <Dinero centimos={m.pozo} className="text-4xl" />
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl">Jugadas</h2>
          {jugadas.length === 0 ? (
            <p className="text-niebla">Todavía nadie ha apostado.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="text-sm text-niebla">
                <tr>
                  <th className="py-2 font-normal">Quién</th>
                  <th className="py-2 font-normal">Por</th>
                  <th className="py-2 text-right font-normal">Puso</th>
                  {!viva && <th className="py-2 text-right font-normal">Cobró</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {jugadas.map((j) => (
                  <tr key={j.id}>
                    <td className="py-2">{j.usuario}</td>
                    <td className="py-2">{opciones.find((o) => o.id === j.opcion_id)?.etiqueta}</td>
                    <td className="py-2 text-right">
                      <Dinero centimos={j.monto} moneda={false} />
                    </td>
                    {!viva && (
                      <td className="py-2 text-right">
                        <Dinero centimos={j.pago ?? 0} moneda={false} className={j.pago ? "" : "text-niebla!"} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        {m.estado === "abierto" ? (
          <Formulario accion={accionApostar} className="panel space-y-4 p-5">
            <h2 className="text-2xl">{miOpcion ? "Subir tu apuesta" : "Apostar"}</h2>
            <input type="hidden" name="mercado_id" value={m.id} />
            <fieldset className="space-y-2">
              <legend className="etiqueta">Opción</legend>
              {opciones.map((o) => (
                <label
                  key={o.id}
                  className={`flex items-center gap-3 rounded-md border border-borde px-3 py-2 has-checked:border-oro ${
                    miOpcion && miOpcion !== o.id ? "opacity-40" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="opcion_id"
                    value={o.id}
                    required
                    defaultChecked={miOpcion === o.id}
                    disabled={!!miOpcion && miOpcion !== o.id}
                    className="accent-[#e8b54a]"
                  />
                  {o.etiqueta}
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="etiqueta">Monto</span>
              <div className="flex items-center rounded-md border border-borde bg-noche focus-within:border-oro">
                <span className="pl-3 text-niebla">S/</span>
                <input name="monto" required inputMode="decimal" placeholder="10" className="w-full bg-transparent px-2 py-2 focus:outline-none" />
              </div>
              <span className="ayuda">Tienes {soles(u.saldo)}.</span>
            </label>
            <Enviar className="w-full">Apostar</Enviar>
          </Formulario>
        ) : (
          <div className="panel p-5 text-niebla">
            {m.estado === "cerrado" && "Ya no se aceptan jugadas. Falta conocer el resultado."}
            {m.estado === "resuelto" && "Resuelta y pagada."}
            {m.estado === "anulado" && "Anulada: se devolvió lo apostado a todos."}
          </div>
        )}

        {puesto > 0 && (
          <div className="panel p-5">
            <p className="text-niebla">Pusiste</p>
            <Dinero centimos={puesto} className="text-3xl" />
            {!viva && (
              <>
                <p className="mt-3 text-niebla">Cobraste</p>
                <Dinero centimos={cobrado} className="text-3xl" />
              </>
            )}
          </div>
        )}

        {gestiona && viva && (
          <div className="panel space-y-4 p-5">
            <h2 className="text-2xl">Gestionar</h2>
            {m.estado === "abierto" && (
              <Formulario accion={accionCerrarApuesta}>
                <input type="hidden" name="mercado_id" value={m.id} />
                <Enviar variante="boton-sobrio" className="w-full">
                  Cerrar jugadas
                </Enviar>
                <p className="ayuda">Ciérrala cuando empiece lo que se apuesta.</p>
              </Formulario>
            )}
            <Formulario accion={accionResolver} confirmar="¿Seguro? Se paga a los ganadores y no se puede deshacer.">
              <input type="hidden" name="mercado_id" value={m.id} />
              <label className="block">
                <span className="etiqueta">Ganó</span>
                <select name="opcion_id" required className="campo">
                  {opciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <Enviar className="mt-3 w-full">Resolver y pagar</Enviar>
            </Formulario>
            <Formulario accion={accionAnular} confirmar="¿Anular? Se devuelve lo apostado a todos.">
              <input type="hidden" name="mercado_id" value={m.id} />
              <Enviar variante="boton-peligro" className="w-full">
                Anular y devolver
              </Enviar>
            </Formulario>
          </div>
        )}
      </aside>
    </div>
  );
}
