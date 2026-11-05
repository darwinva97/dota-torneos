import Link from "next/link";
import { notFound } from "next/navigation";
import { saldoAcumulado } from "@/lib/acumulado";
import { partidasConCambio } from "@/lib/alineaciones";
import { Suspense } from "react";
import { exigirUsuario, type Usuario } from "@/lib/sesion";
import {
  costoInscripcion,
  equiposDe,
  nombreJuego,
  partidasDe,
  tablaDe,
  torneo,
  type Equipo,
  type Torneo,
} from "@/lib/torneos";
import { mercadosDeTorneo } from "@/lib/mercados";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { esLichess, esPorPuntos, nombreFormato } from "@/lib/formatos";
import { posiciones as posicionesLichess, urlTorneo } from "@/lib/lichess";
import { Cuadro, PanelLichess, RondasPuntos, TablaPuntos } from "./formatos";
import { Cargando, Dinero, Estado, Vacio } from "@/components/ui";
import {
  accionApostarEnTorneo,
  accionAumentarPremio,
  accionSumarAcumulado,
  accionAsistencia,
  accionCancelarTorneo,
  accionCrearEquipo,
  accionIniciar,
  accionSalirTorneo,
  accionUnirse,
} from "../../acciones/torneos";

export default function PaginaTorneo({ params }: PageProps<"/torneos/[id]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: PageProps<"/torneos/[id]">["params"] }) {
  const u = await exigirUsuario();
  const t = torneo(Number((await params).id));
  if (!t) notFound();
  const equipos = equiposDe(t.id);
  const partidas = partidasDe(t.id);
  const mercados = mercadosDeTorneo(t.id);
  const cambiadas = partidasConCambio(t.id);
  const organiza = t.organizador_id === u.id || !!u.es_admin;
  const miEquipo = equipos.find((e) => e.integrantes.some((i) => i.usuario_id === u.id));
  const campeon = equipos.find((e) => e.id === t.campeon_id);
  const nombre = (id: number | null) => equipos.find((e) => e.id === id)?.nombre;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[60ch]">
          <div className="mb-2">
            <Estado estado={t.estado} />
          </div>
          <h1 className="text-5xl sm:text-6xl">{t.nombre}</h1>
          <p className="mt-2 text-niebla">
            Organiza {t.organizador}
            {t.fecha ? `. Se juega ${t.fecha}` : ""}.{" "}
            {t.juego === "ajedrez" ? `${nombreJuego(t)}, uno contra uno` : `Dota 2, equipos de ${t.tam_equipo}`},{" "}
            {nombreFormato(t.juego, t.formato).toLowerCase()}
            {t.formato === "mixto" ? ` (pasan ${t.clasifican})` : ""},{" "}
            {t.reparto === "70-30" ? "70 % al campeón y 30 % al subcampeón" : "todo al campeón"}.
          </p>
          <p className="mt-2">{textoInscripcion(t)}</p>
          {t.descripcion && <p className="mt-3 whitespace-pre-line">{t.descripcion}</p>}
        </div>
        <div className="text-right">
          <div className="text-niebla">{t.suma_recaudado ? "Premio" : "Premio fijo"}</div>
          <Dinero centimos={t.pozo} className="text-6xl sm:text-7xl" />
          {t.pozo_pagina > 0 && (
            <p className="mt-1 max-w-[28ch] text-sm text-oro">Incluye {soles(t.pozo_pagina)} del pozo acumulado de la página</p>
          )}
          {(t.premio_base > 0 || !t.suma_recaudado) && (
            <p className="mt-1 max-w-[28ch] text-sm text-niebla">
              {t.suma_recaudado
                ? `${soles(t.premio_base)} de base que puso ${t.organizador} más ${soles(t.recaudado)} recaudado`
                : `Lo pone ${t.organizador}. Lo recaudado (${soles(t.recaudado)}) vuelve a quien organiza.`}
            </p>
          )}
          {t.garantias_pendientes > 0 && !!t.suma_recaudado && (
            <p className="mt-1 max-w-[24ch] text-sm text-niebla">
              y hasta {soles(t.garantias_pendientes)} más con las garantías de quienes falten
            </p>
          )}
        </div>
      </header>

      {campeon && (
        <section className="rounded-lg border border-oro/60 bg-oro/10 px-6 py-5">
          <p className="text-niebla">Campeón</p>
          <p className="cifra text-4xl text-oro">{campeon.nombre}</p>
          <p className="mt-1">{campeon.integrantes.map((i) => i.usuario).join(", ")}</p>
        </section>
      )}

      {t.estado === "inscripciones" && (
        <Inscripciones t={t} equipos={equipos} u={u} miEquipo={miEquipo} organiza={organiza} />
      )}

      {t.estado !== "inscripciones" && t.estado !== "cancelado" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-3xl">{esPorPuntos(t.formato) ? "Clasificación" : "Cuadro"}</h2>
            {t.estado === "en_curso" && (
              <Formulario accion={accionApostarEnTorneo}>
                <input type="hidden" name="torneo_id" value={t.id} />
                <Enviar variante="boton-sobrio">Apostar al campeón</Enviar>
              </Formulario>
            )}
          </div>
          {esLichess(t.formato) ? (
            <PanelLichessConDatos t={t} equipos={equipos} yo={u.id} organiza={organiza} miLichess={u.lichess_usuario} />
          ) : esPorPuntos(t.formato) ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[1fr_1fr]">
              <TablaPuntos filas={tablaDe(t)} nombre={nombre} sistema={t.formato === "liga" ? "liga" : "suizo"} />
              <RondasPuntos t={t} partidas={partidas} nombre={nombre} organiza={organiza} cambiadas={cambiadas} />
            </div>
          ) : (
            <Cuadro t={t} partidas={partidas} equipos={equipos} organiza={organiza} cambiadas={cambiadas} />
          )}
          {organiza && t.estado === "en_curso" && !esLichess(t.formato) && (
            <p className="text-sm text-niebla">
              {esPorPuntos(t.formato)
                ? "Anota cada resultado: 1-0 si ganan blancas, ½-½ tablas, 0-1 si ganan negras. Las apuestas de la partida se pagan solas (con tablas se devuelven)."
                : "Marca «Empieza» cuando arranque cada partida: eso cierra sus apuestas. Al marcar al ganador, las apuestas de la partida se pagan solas."}
            </p>
          )}
        </section>
      )}

      {t.estado !== "inscripciones" && equipos.length > 0 && (
        <section>
          <h2 className="mb-4 text-3xl">{t.juego === "ajedrez" ? "Jugadores" : "Equipos"}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {equipos.map((e) => (
              <TarjetaEquipo key={e.id} e={e} t={t} />
            ))}
          </div>
        </section>
      )}

      {mercados.length > 0 && (
        <section>
          <h2 className="mb-4 text-3xl">Apuestas de este torneo</h2>
          <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde">
            {mercados.map((m) => (
              <li key={m.id}>
                <Link href={`/apuestas/${m.id}`} className="flex flex-wrap items-center gap-3 bg-losa px-5 py-3 hover:bg-losa-alta">
                  <span>{m.titulo}</span>
                  <Estado estado={m.estado} />
                  <Dinero centimos={m.pozo} className="ml-auto text-xl" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {organiza && (t.estado === "inscripciones" || t.estado === "en_curso") && (
        <section className="flex flex-wrap items-end justify-between gap-6 border-t border-borde pt-6">
          {t.organizador_id === u.id && (
            <Formulario accion={accionAumentarPremio} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="torneo_id" value={t.id} />
              <label>
                <span className="etiqueta">Aumentar el premio</span>
                <span className="flex items-center rounded-md border border-borde bg-hondo focus-within:border-oro">
                  <span className="pl-3 text-niebla">S/</span>
                  <input name="monto" required inputMode="decimal" placeholder="20" className="w-28 bg-transparent px-2 py-2 focus:outline-none" />
                </span>
              </label>
              <Enviar variante="boton-sobrio">Agregar de mi saldo</Enviar>
            </Formulario>
          )}
          {!!u.es_admin && saldoAcumulado() > 0 && (
            <Formulario accion={accionSumarAcumulado} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="torneo_id" value={t.id} />
              <label>
                <span className="etiqueta">Sumar del pozo acumulado ({soles(saldoAcumulado())})</span>
                <select name="pct" defaultValue="100" className="campo w-auto">
                  <option value="25">25 %</option>
                  <option value="50">50 %</option>
                  <option value="75">75 %</option>
                  <option value="100">Todo</option>
                </select>
              </label>
              <Enviar variante="boton-sobrio">Sumar al premio</Enviar>
            </Formulario>
          )}
          <Formulario
            accion={accionCancelarTorneo}
            confirmar="¿Cancelar el torneo? Se devuelven todas las entradas y se anulan sus apuestas."
          >
            <input type="hidden" name="torneo_id" value={t.id} />
            <Enviar variante="boton-peligro">Cancelar torneo y devolver todo</Enviar>
          </Formulario>
        </section>
      )}
    </div>
  );
}

function Inscripciones({
  t,
  equipos,
  u,
  miEquipo,
  organiza,
}: {
  t: Torneo;
  equipos: Equipo[];
  u: Usuario;
  miEquipo?: Equipo;
  organiza: boolean;
}) {
  const hayHueco = equipos.length < t.max_equipos;
  const costo = costoInscripcion(t);
  const ajedrez = t.juego === "ajedrez";
  const sinMarcar = equipos.flatMap((e) => e.integrantes).filter((i) => i.garantia > 0 && !i.asistencia).length;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">
          {ajedrez ? "Jugadores" : "Equipos"}{" "}
          <span className="cifra text-niebla">
            {equipos.length} de {t.max_equipos}
          </span>
        </h2>
        {organiza && (
          <Formulario
            // Al cambiar las marcas se monta de nuevo y se borra un error viejo.
            key={sinMarcar}
            accion={accionIniciar}
            className="text-right"
            confirmar={
              esLichess(t.formato)
                ? "¿Cerrar inscripciones y crear el torneo en Lichess? Inscribiremos a todos con su cuenta."
                : "¿Cerrar inscripciones y empezar? Ya nadie podrá entrar ni salir."
            }
          >
            <input type="hidden" name="torneo_id" value={t.id} />
            <Enviar>
              {esLichess(t.formato)
                ? "Cerrar inscripciones y crear en Lichess"
                : esPorPuntos(t.formato)
                  ? "Cerrar inscripciones y emparejar"
                  : "Cerrar inscripciones y sortear cuadro"}
            </Enviar>
          </Formulario>
        )}
      </div>

      {organiza && t.garantia > 0 && equipos.length > 0 && (
        <p className="rounded-md border border-oro/40 bg-oro/5 px-4 py-3">
          Cuando sea la hora{t.limite_llegada ? ` (${t.limite_llegada})` : ""}, marca quién llegó a tiempo. Al sortear,
          se devuelve la garantía a quien llegó y la de quien faltó pasa al pozo.{" "}
          {sinMarcar > 0 ? (
            <span className="text-oro">
              Falta marcar a {sinMarcar} {sinMarcar === 1 ? "jugador" : "jugadores"}.
            </span>
          ) : (
            <span className="text-radiant">Ya marcaste a todos.</span>
          )}
        </p>
      )}

      {equipos.length === 0 ? (
        <Vacio>
          {ajedrez
            ? "Aún no hay nadie inscrito. Inscríbete abajo y comparte el enlace de esta página."
            : "Aún no hay equipos. Crea el tuyo abajo y comparte el enlace de esta página."}
        </Vacio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {equipos.map((e) => (
            <TarjetaEquipo key={e.id} e={e} t={t} marcarAsistencia={organiza}>
              {!miEquipo && e.integrantes.length < t.tam_equipo && (
                <Formulario accion={accionUnirse} className="mt-3">
                  <input type="hidden" name="equipo_id" value={e.id} />
                  <Enviar variante="boton-sobrio" className="w-full">
                    Unirme{costo > 0 ? ` y pagar ${soles(costo)}` : ""}
                  </Enviar>
                </Formulario>
              )}
            </TarjetaEquipo>
          ))}
        </div>
      )}

      {miEquipo ? (
        <Formulario accion={accionSalirTorneo} confirmar="¿Salir del torneo? Te devolvemos todo lo que pagaste.">
          <input type="hidden" name="torneo_id" value={t.id} />
          <p className="mb-2 text-niebla">
            {ajedrez ? "Estás inscrito" : <>Estás en <span className="text-pergamino">{miEquipo.nombre}</span></>}
            {costo > 0 ? ` y pagaste ${soles(costo)}` : ""}.
            {t.garantia > 0 && ` Recuerda: si no llegas a tiempo, tus ${soles(t.garantia)} de garantía van al pozo.`}
          </p>
          <Enviar variante="boton-sobrio">Salir del torneo</Enviar>
        </Formulario>
      ) : hayHueco ? (
        <Formulario accion={accionCrearEquipo} className="panel flex max-w-xl flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="torneo_id" value={t.id} />
          {ajedrez ? (
            <p className="min-w-48 flex-1">
              Juegas con tu usuario, <span className="text-pergamino">{u.usuario}</span>.
            </p>
          ) : (
            <label className="min-w-48 flex-1">
              <span className="etiqueta">Crear un equipo nuevo</span>
              <input name="nombre" required placeholder="Nombre del equipo" className="campo" />
            </label>
          )}
          <Enviar>
            {ajedrez ? "Inscribirme" : "Crear"}
            {costo > 0 ? ` y pagar ${soles(costo)}` : ""}
          </Enviar>
          {esLichess(t.formato) && !u.lichess_usuario && (
            <p className="basis-full text-sm text-dire-claro">
              Este torneo se juega en Lichess.{" "}
              <Link href="/perfil" className="underline underline-offset-4">
                Conecta tu cuenta de Lichess
              </Link>{" "}
              para inscribirte: te apuntaremos allí solos.
            </p>
          )}
          {u.saldo < costo && (
            <p className="basis-full text-sm text-niebla">
              Tienes {soles(u.saldo)}.{" "}
              <Link href="/billetera" className="text-oro underline underline-offset-4">
                Recarga con Yape
              </Link>{" "}
              para poder entrar.
            </p>
          )}
        </Formulario>
      ) : null}
    </section>
  );
}

function TarjetaEquipo({
  e,
  t,
  marcarAsistencia = false,
  children,
}: {
  e: Equipo;
  t: Torneo;
  marcarAsistencia?: boolean;
  children?: React.ReactNode;
}) {
  const conGarantia = t.garantia > 0;
  const huecos = Math.max(0, t.tam_equipo - e.integrantes.length);
  const gano = t.campeon_id === e.id;
  return (
    <div className={`panel p-4 ${gano ? "border-oro/60" : ""}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xl">{e.nombre}</h3>
        {t.tam_equipo > 1 && (
          <span className="cifra text-niebla">
            {e.integrantes.length}/{t.tam_equipo}
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {e.integrantes.map((i) => (
          <li key={i.usuario_id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span>
              {i.usuario}
              {t.tam_equipo > 1 && i.usuario_id === e.capitan_id && <span className="text-niebla"> (capitán)</span>}
            </span>
            {conGarantia && i.garantia > 0 ? (
              marcarAsistencia && t.estado === "inscripciones" ? (
                <MarcarAsistencia torneoId={t.id} jugadorId={i.usuario_id} actual={i.asistencia} />
              ) : (
                <EstadoAsistencia asistencia={i.asistencia} />
              )
            ) : (
              i.nick_dota && <span className="truncate text-niebla">{i.nick_dota}</span>
            )}
          </li>
        ))}
        {Array.from({ length: huecos }, (_, k) => (
          <li key={`h${k}`} className="text-niebla/60">
            Puesto libre
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function textoInscripcion(t: Torneo) {
  const costo = costoInscripcion(t);
  if (costo === 0) return "Inscripción gratis.";
  const destino = t.suma_recaudado ? "al premio" : "a quien organiza";
  if (t.garantia === 0) return `Inscripción de ${soles(costo)} por jugador, todo ${destino}.`;
  return `Inscripción de ${soles(costo)} por jugador: ${soles(t.entrada)} van ${destino} y ${soles(t.garantia)} son garantía de puntualidad, que se devuelve a quien llega a tiempo${t.limite_llegada ? ` (antes de ${t.limite_llegada})` : ""} y va ${destino} si falta.`;
}

function EstadoAsistencia({ asistencia }: { asistencia: Equipo["integrantes"][number]["asistencia"] }) {
  if (asistencia === "a_tiempo") return <span className="text-sm text-radiant">Llegó a tiempo</span>;
  if (asistencia === "falto") return <span className="text-sm text-dire-claro">Faltó</span>;
  return <span className="text-sm text-niebla">Asistencia sin marcar</span>;
}

// Dos botones juntos; el marcado queda resaltado. Pulsar el marcado lo desmarca.
function MarcarAsistencia({
  torneoId,
  jugadorId,
  actual,
}: {
  torneoId: number;
  jugadorId: number;
  actual: Equipo["integrantes"][number]["asistencia"];
}) {
  const boton = (valor: "a_tiempo" | "falto", texto: string, activo: string) => (
    <button
      name="asistencia"
      value={actual === valor ? "" : valor}
      aria-pressed={actual === valor}
      className={`px-2 py-0.5 text-sm transition-colors ${actual === valor ? activo : "text-niebla hover:text-pergamino"}`}
    >
      {texto}
    </button>
  );
  return (
    <Formulario accion={accionAsistencia} className="flex flex-wrap justify-end" sinOk>
      <input type="hidden" name="torneo_id" value={torneoId} />
      <input type="hidden" name="jugador_id" value={jugadorId} />
      <span className="flex divide-x divide-borde overflow-hidden rounded-md border border-borde">
        {boton("a_tiempo", "A tiempo", "bg-radiant/20 text-radiant")}
        {boton("falto", "Faltó", "bg-dire/20 text-dire-claro")}
      </span>
    </Formulario>
  );
}

async function PanelLichessConDatos(props: {
  t: Torneo;
  equipos: Equipo[];
  yo: number;
  organiza: boolean;
  miLichess: string;
}) {
  let filas = null;
  let error = null;
  if (props.t.lichess_id) {
    try {
      filas = await posicionesLichess(props.t);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return <PanelLichess {...props} url={urlTorneo(props.t)} posiciones={filas} error={error} />;
}
