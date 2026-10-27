import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { exigirUsuario, type Usuario } from "@/lib/sesion";
import {
  costoInscripcion,
  equiposDe,
  partidasDe,
  torneo,
  type Equipo,
  type Partida,
  type Torneo,
} from "@/lib/torneos";
import { mercadosDeTorneo } from "@/lib/mercados";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando, Dinero, Estado, Vacio } from "@/components/ui";
import {
  accionApostarEnTorneo,
  accionAsistencia,
  accionCancelarTorneo,
  accionCrearEquipo,
  accionEnJuego,
  accionGanador,
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
  const organiza = t.organizador_id === u.id || !!u.es_admin;
  const miEquipo = equipos.find((e) => e.integrantes.some((i) => i.usuario_id === u.id));
  const campeon = equipos.find((e) => e.id === t.campeon_id);

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
            {t.fecha ? `. Se juega ${t.fecha}` : ""}. Equipos de {t.tam_equipo},{" "}
            {t.reparto === "70-30" ? "70 % al campeón y 30 % al subcampeón" : "todo al campeón"}.
          </p>
          <p className="mt-2">{textoInscripcion(t)}</p>
          {t.descripcion && <p className="mt-3 whitespace-pre-line">{t.descripcion}</p>}
        </div>
        <div className="text-right">
          <div className="text-niebla">Pozo</div>
          <Dinero centimos={t.pozo} className="text-6xl sm:text-7xl" />
          {t.garantias_pendientes > 0 && (
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

      {partidas.length > 0 && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-3xl">Cuadro</h2>
            {t.estado === "en_curso" && (
              <Formulario accion={accionApostarEnTorneo}>
                <input type="hidden" name="torneo_id" value={t.id} />
                <Enviar variante="boton-sobrio">Apostar al campeón</Enviar>
              </Formulario>
            )}
          </div>
          <Cuadro t={t} partidas={partidas} equipos={equipos} organiza={organiza} />
          {organiza && t.estado === "en_curso" && (
            <p className="mt-3 text-sm text-niebla">
              Marca «Empieza» cuando arranque cada partida: eso cierra sus apuestas. Al marcar al ganador, las apuestas
              de la partida se pagan solas.
            </p>
          )}
        </section>
      )}

      {t.estado !== "inscripciones" && equipos.length > 0 && (
        <section>
          <h2 className="mb-4 text-3xl">Equipos</h2>
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
        <section className="border-t border-borde pt-6">
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
  const sinMarcar = equipos.flatMap((e) => e.integrantes).filter((i) => i.garantia > 0 && !i.asistencia).length;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">
          Equipos{" "}
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
            confirmar="¿Cerrar inscripciones y sortear el cuadro? Ya nadie podrá entrar ni salir."
          >
            <input type="hidden" name="torneo_id" value={t.id} />
            <Enviar>Cerrar inscripciones y sortear cuadro</Enviar>
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
        <Vacio>Aún no hay equipos. Crea el tuyo abajo y comparte el enlace de esta página.</Vacio>
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
            Estás en <span className="text-pergamino">{miEquipo.nombre}</span>
            {costo > 0 ? ` y pagaste ${soles(costo)}` : ""}.
            {t.garantia > 0 && ` Recuerda: si no llegas a tiempo, tus ${soles(t.garantia)} de garantía van al pozo.`}
          </p>
          <Enviar variante="boton-sobrio">Salir del torneo</Enviar>
        </Formulario>
      ) : hayHueco ? (
        <Formulario accion={accionCrearEquipo} className="panel flex max-w-xl flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="torneo_id" value={t.id} />
          <label className="min-w-48 flex-1">
            <span className="etiqueta">Crear un equipo nuevo</span>
            <input name="nombre" required placeholder="Nombre del equipo" className="campo" />
          </label>
          <Enviar>Crear{costo > 0 ? ` y pagar ${soles(costo)}` : ""}</Enviar>
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
        <span className="cifra text-niebla">
          {e.integrantes.length}/{t.tam_equipo}
        </span>
      </div>
      <ul className="space-y-1">
        {e.integrantes.map((i) => (
          <li key={i.usuario_id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span>
              {i.usuario}
              {i.usuario_id === e.capitan_id && <span className="text-niebla"> (capitán)</span>}
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
  if (t.garantia === 0) return `Inscripción de ${soles(costo)} por jugador, todo al pozo.`;
  return `Inscripción de ${soles(costo)} por jugador: ${soles(t.entrada)} van al pozo y ${soles(t.garantia)} son garantía de puntualidad, que se devuelve a quien llega a tiempo${t.limite_llegada ? ` (antes de ${t.limite_llegada})` : ""} y va al pozo si falta.`;
}

function EstadoAsistencia({ asistencia }: { asistencia: Equipo["integrantes"][number]["asistencia"] }) {
  if (asistencia === "a_tiempo") return <span className="text-sm text-radiant">Llegó a tiempo</span>;
  if (asistencia === "falto") return <span className="text-sm text-[#e88a7f]">Faltó</span>;
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
        {boton("falto", "Faltó", "bg-dire/20 text-[#e88a7f]")}
      </span>
    </Formulario>
  );
}

function nombreRonda(ronda: number, total: number) {
  const faltan = total - ronda;
  if (faltan === 0) return "Final";
  if (faltan === 1) return "Semifinales";
  if (faltan === 2) return "Cuartos";
  return `Ronda ${ronda}`;
}

function Cuadro({
  t,
  partidas,
  equipos,
  organiza,
}: {
  t: Torneo;
  partidas: Partida[];
  equipos: Equipo[];
  organiza: boolean;
}) {
  const total = Math.max(...partidas.map((p) => p.ronda));
  const nombre = (id: number | null) => equipos.find((e) => e.id === id)?.nombre;
  const rondas = Array.from({ length: total }, (_, i) => partidas.filter((p) => p.ronda === i + 1));

  return (
    <div className="overflow-x-auto pb-2">
      <ol className="flex min-w-max gap-6">
        {rondas.map((lista, i) => (
          <li key={i} className="flex w-64 flex-col">
            <h3 className="mb-3 text-lg text-niebla">{nombreRonda(i + 1, total)}</h3>
            <ul className="flex flex-1 flex-col justify-around gap-4">
              {lista.map((p) => (
                <li key={p.id}>
                  <TarjetaPartida p={p} nombre={nombre} t={t} organiza={organiza} final={i + 1 === total} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TarjetaPartida({
  p,
  nombre,
  t,
  organiza,
  final,
}: {
  p: Partida;
  nombre: (id: number | null) => string | undefined;
  t: Torneo;
  organiza: boolean;
  final: boolean;
}) {
  const lista = p.estado === "pendiente" || p.estado === "en_juego";
  const completa = !!(p.equipo_a && p.equipo_b);
  const puedeReportar = organiza && t.estado === "en_curso" && lista && completa;

  const fila = (id: number | null) => {
    const gano = p.ganador != null && p.ganador === id;
    const perdio = p.ganador != null && id != null && p.ganador !== id;
    return (
      <div
        className={`flex min-h-10 items-center justify-between gap-2 px-3 py-2 ${
          gano ? "text-pergamino" : perdio ? "text-niebla line-through decoration-dire/70" : ""
        }`}
      >
        <span className={id ? "" : "text-niebla/60"}>{nombre(id) ?? (p.estado === "bye" ? "Pasa directo" : "Por definir")}</span>
        {gano && <span className="size-2 shrink-0 rounded-full bg-radiant" aria-label="ganó" />}
        {puedeReportar && id && (
          <Formulario accion={accionGanador} confirmar={`¿Ganó ${nombre(id)}? No se puede deshacer.`}>
            <input type="hidden" name="partida_id" value={p.id} />
            <input type="hidden" name="equipo_id" value={id} />
            <Enviar variante="boton-sobrio" className="px-2 py-0.5 text-sm whitespace-nowrap">
              Marcar ganador
            </Enviar>
          </Formulario>
        )}
      </div>
    );
  };

  return (
    <div className={`rounded-md border bg-losa ${final ? "border-oro/50" : "border-borde"}`}>
      {p.estado === "en_juego" && (
        <div className="border-b border-borde px-3 py-1 text-sm text-radiant">Jugándose ahora</div>
      )}
      <div className="divide-y divide-borde">
        {fila(p.equipo_a)}
        {fila(p.equipo_b)}
      </div>
      {completa && p.estado === "pendiente" && t.estado === "en_curso" && (
        <div className="flex flex-wrap gap-2 border-t border-borde px-3 py-2">
          <Formulario accion={accionApostarEnTorneo}>
            <input type="hidden" name="torneo_id" value={t.id} />
            <input type="hidden" name="partida_id" value={p.id} />
            <button className="text-sm text-oro hover:underline">Apostar</button>
          </Formulario>
          {organiza && (
            <Formulario accion={accionEnJuego} className="ml-auto">
              <input type="hidden" name="partida_id" value={p.id} />
              <button className="text-sm text-niebla hover:text-pergamino">Empieza</button>
            </Formulario>
          )}
        </div>
      )}
    </div>
  );
}
