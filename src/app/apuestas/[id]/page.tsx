import Link from "next/link";
import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { estadoParche, jugadasDe, mercado, opcionesDe } from "@/lib/mercados";
import { torneo } from "@/lib/torneos";
import { cobroParche, soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando, Dinero, Estado, fecha } from "@/components/ui";
import { cruzar, type JugadaCruce } from "@/lib/cruces";
import {
  accionAnular,
  accionApostar,
  accionBloquear,
  accionDevolverNoParchado,
  accionEmpatar,
  accionResolver,
  accionRetirarApuesta,
} from "../../acciones/apuestas";

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
  const parche = estadoParche(m.id);
  // Igualar también lo puede hacer quien organiza el torneo de la apuesta.
  const puedeIgualar =
    gestiona || (!!m.torneo_id && torneo(m.torneo_id)?.organizador_id === u.id);
  const listaParaResolver = !parche || parche.parchada;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <header>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Estado estado={m.estado} />
            {m.torneo_id && (
              <Link href={`/torneos/${m.torneo_id}`} className="text-sm text-niebla underline underline-offset-4 hover:text-pergamino">
                Ver torneo
              </Link>
            )}
            {m.torneo_id && m.partida_id && (
              <Link
                href={`/torneos/${m.torneo_id}/partida/${m.partida_id}`}
                className="text-sm text-niebla underline underline-offset-4 hover:text-pergamino"
              >
                Ver quién juega
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

        {parche && viva && <PanelParche p={parche} puedeIgualar={puedeIgualar} mercadoId={m.id} pagoPct={m.pago_pct} />}
        {parche && jugadas.length > 0 && (
          <CrucesParche
            etiquetaA={parche.a.etiqueta}
            etiquetaB={parche.b.etiqueta}
            a={jugadas.filter((j) => j.opcion_id === parche.a.id)}
            b={jugadas.filter((j) => j.opcion_id === parche.b.id)}
            yo={u.usuario}
          />
        )}

        <section aria-label="Opciones" className="space-y-3">
          {opciones.map((o) => {
            const parte = m.pozo > 0 ? o.total / m.pozo : 0;
            const cuota = o.total > 0 ? (m.pozo * m.pago_pct) / 100 / o.total : null;
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
                    {parche
                      ? `Si gana este bando, cada uno cobra ${cobroParche(m.pago_pct)} lo que puso.`
                      : cuota
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
          {m.pago_pct < 100 && (
            <p className="text-right text-sm text-niebla">
              {m.estado === "resuelto"
                ? `Los ganadores cobraron el ${m.pago_pct} %; ${soles(m.comision)} fueron al `
                : `Los ganadores se reparten el ${m.pago_pct} %; el ${100 - m.pago_pct} % va al `}
              <Link href="/pozo" className="underline underline-offset-2 hover:text-pergamino">
                pozo acumulado
              </Link>
              . Si se anula o nadie acierta, se devuelve todo.
            </p>
          )}
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
              <span className="ayuda">
                Tienes {soles(u.saldo)}.
                {parche?.bajo && ` Para parchar faltan ${soles(parche.falta)} por ${parche.bajo.etiqueta}.`}
              </span>
            </label>
            <Enviar className="w-full">Apostar</Enviar>
          </Formulario>
        ) : (
          <div className="panel p-5 text-niebla">
            {m.estado === "cerrado" && "Apuestas bloqueadas: ya nadie puede entrar ni retirarse. Falta el resultado."}
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
            {m.estado === "abierto" && (
              <Formulario accion={accionRetirarApuesta} confirmar="¿Retirar tu apuesta? Vuelve a tu saldo." className="mt-3">
                <p className="ayuda mb-2">Puedes retirarla hasta que se bloqueen las apuestas al empezar la partida.</p>
                <input type="hidden" name="mercado_id" value={m.id} />
                <Enviar variante="boton-sobrio" className="w-full py-1.5 text-sm">
                  Retirar mi apuesta
                </Enviar>
              </Formulario>
            )}
          </div>
        )}

        {puedeIgualar && m.estado === "abierto" && (
          <Formulario
            accion={accionBloquear}
            className="panel hud space-y-2 p-5"
            confirmar={
              parche && !parche.parchada
                ? "Se devuelve lo que sobra del bando que puso de más y nadie podrá entrar ni retirarse. ¿Bloquear?"
                : "Nadie podrá entrar ni retirarse. ¿Bloquear?"
            }
          >
            <input type="hidden" name="mercado_id" value={m.id} />
            <Enviar className="w-full py-3 text-lg">
              <Lock className="size-5" aria-hidden /> Bloquear apuestas
            </Enviar>
            <p className="ayuda">
              Púlsalo cuando empiece la partida: desde ahí nadie puede entrar ni retirar su apuesta.
              {parche && !parche.parchada ? ` Antes se devuelve lo que sobra (${soles(parche.falta)}) para dejarla parchada.` : ""}
            </p>
          </Formulario>
        )}

        {gestiona && viva && (
          <div className="panel space-y-4 p-5">
            <h2 className="text-2xl">Gestionar</h2>
            {m.estado === "abierto" && (
              <p className="text-sm text-niebla">Para resolverla, primero bloquea las apuestas.</p>
            )}
            {listaParaResolver && m.estado === "cerrado" && (
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
            )}
            {parche && (m.estado === "abierto" || !!u.es_admin) && (
              <Formulario accion={accionEmpatar} confirmar="¿Empate? Se devuelve lo apostado a todos.">
                <input type="hidden" name="mercado_id" value={m.id} />
                <Enviar variante="boton-sobrio" className="w-full">
                  Empate o tablas: devolver a todos
                </Enviar>
              </Formulario>
            )}
            {(m.estado === "abierto" || !!u.es_admin) && (
              <Formulario accion={accionAnular} confirmar="¿Anular? Se devuelve lo apostado a todos.">
                <input type="hidden" name="mercado_id" value={m.id} />
                <Enviar variante="boton-peligro" className="w-full">
                  Anular y devolver
                </Enviar>
              </Formulario>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// Los dos bandos frente a frente: cuánto hay en cada uno y cuánto falta.
function PanelParche({
  p,
  puedeIgualar,
  mercadoId,
  pagoPct,
}: {
  p: NonNullable<ReturnType<typeof estadoParche>>;
  puedeIgualar: boolean;
  mercadoId: number;
  pagoPct: number;
}) {
  const total = p.a.total + p.b.total;
  const parteA = total ? (p.a.total / total) * 100 : 50;
  return (
    <section
      aria-label="Parche"
      className={`panel space-y-3 p-5 ${p.parchada ? "border-radiant/50" : "border-oro/40"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">Parche 1 a 1</h2>
        <Estado
          estado={p.parchada ? "resuelto" : "pendiente"}
          texto={p.parchada ? "Parchada: puede empezar" : "Sin parchar"}
        />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span>
          <span className="block text-sm text-niebla">{p.a.etiqueta}</span>
          <span className="cifra text-3xl text-oro">{soles(p.a.total)}</span>
        </span>
        <span className="cifra text-2xl text-niebla">{p.parchada ? "=" : "≠"}</span>
        <span className="text-right">
          <span className="block text-sm text-niebla">{p.b.etiqueta}</span>
          <span className="cifra text-3xl text-oro">{soles(p.b.total)}</span>
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full bg-oro" style={{ width: `${parteA}%` }} />
        <div className="h-full flex-1 bg-mana" />
      </div>
      <p className="text-sm text-niebla">
        {p.parchada
          ? `Los dos bandos pusieron lo mismo. Quien gane cobra ${cobroParche(pagoPct)} lo que apostó.`
          : p.a.total + p.b.total === 0
            ? "Nadie ha apostado todavía. El evento solo puede empezar cuando los dos bandos pongan lo mismo."
            : `Faltan ${soles(p.falta)} por ${p.bajo!.etiqueta} para que pueda empezar. También pueden retirar lo que sobra.`}
      </p>
      {!p.parchada && p.a.total + p.b.total > 0 && puedeIgualar && (
        <Formulario
          accion={accionDevolverNoParchado}
          confirmar="Se devuelve lo que sobra del bando que puso de más, empezando por las últimas apuestas. ¿Seguir?"
        >
          <input type="hidden" name="mercado_id" value={mercadoId} />
          <Enviar variante="boton-sobrio" className="py-1.5 text-sm">
            Devolver lo no parchado
          </Enviar>
        </Formulario>
      )}
    </section>
  );
}

// Quién está parchado contra quién: primero lo que aún no tiene rival y luego
// cada cruce, de lo más reciente a lo más antiguo.
function CrucesParche({
  etiquetaA,
  etiquetaB,
  a,
  b,
  yo,
}: {
  etiquetaA: string;
  etiquetaB: string;
  a: JugadaCruce[];
  b: JugadaCruce[];
  yo: string;
}) {
  const { sinParchar, cruces } = cruzar(a, b);
  const quien = (j: JugadaCruce, monto: number, lado: "a" | "b") => (
    <span className={`min-w-0 ${lado === "b" ? "text-right" : ""}`}>
      <span className={`block truncate font-medium ${j.usuario === yo ? "text-oro" : ""}`}>
        {j.usuario}
        {j.usuario === yo ? " (tú)" : ""}
      </span>
      <span className="block text-xs text-niebla">
        {monto < j.monto ? `${soles(monto)} de sus ${soles(j.monto)}` : soles(monto)}
      </span>
      <span className="block text-xs text-niebla/70">{fecha(j.creado)}</span>
    </span>
  );
  return (
    <section aria-label="Cruces del parche" className="panel space-y-5 p-5">
      <h2 className="text-2xl">Quién contra quién</h2>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-lg text-dire-claro">
          Sin parchar
          {sinParchar.length > 0 && (
            <span className="cifra text-base">{soles(sinParchar.reduce((s, x) => s + x.monto, 0))}</span>
          )}
        </h3>
        {sinParchar.length === 0 ? (
          <p className="text-sm text-niebla">Todo está parchado: cada sol tiene rival.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-md border border-dire/30 bg-dire/5">
            {sinParchar.map((x, k) => (
              <li key={`${x.jugada.id}-${k}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                {quien(x.jugada, x.monto, "a")}
                <span className="text-sm text-niebla">
                  por {x.lado === "a" ? etiquetaA : etiquetaB}, sin rival
                </span>
              </li>
            ))}
          </ul>
        )}
        {sinParchar.length > 0 && (
          <p className="ayuda">
            Si alguien apuesta por el otro bando, lo cubre. Si no, se devuelve al igualar o al bloquear las apuestas.
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] gap-3 text-sm text-niebla">
          <span className="truncate">{etiquetaA}</span>
          <span />
          <span className="truncate text-right">{etiquetaB}</span>
        </div>
        {cruces.length === 0 ? (
          <p className="text-sm text-niebla">Todavía nadie está parchado: falta que alguien apueste por el otro bando.</p>
        ) : (
          <ul className="space-y-2">
            {cruces.map((c, k) => (
              <li
                key={`${c.a.id}-${c.b.id}-${k}`}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-white/[0.07] bg-hondo/60 px-3 py-2"
              >
                {quien(c.a, c.monto, "a")}
                <span className="cifra rounded bg-oro/10 px-2 py-0.5 text-sm text-oro">{soles(c.monto)}</span>
                {quien(c.b, c.monto, "b")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
