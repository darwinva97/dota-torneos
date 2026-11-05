import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { Equipo, Partida, Torneo } from "@/lib/torneos";
import type { Fila } from "@/lib/puntos";
import type { PosicionLichess } from "@/lib/lichess";
import { Formulario, Enviar } from "@/components/formulario";
import { Copiar } from "@/components/copiar";
import { Vacio } from "@/components/ui";
import {
  accionApostarEnTorneo,
  accionEnJuego,
  accionGanador,
  accionInscribirmeLichess,
  accionResultado,
  accionSincronizarLichess,
} from "../../acciones/torneos";

type Nombre = (id: number | null) => string | undefined;

// --- Cuadros: descarte, upper, lower y gran final ---

const SECCIONES = [
  { llave: "Q", titulo: "Clasificatoria por descarte" },
  { llave: "U", titulo: "Upper bracket" },
  { llave: "L", titulo: "Lower bracket" },
  { llave: "GF", titulo: "Gran final" },
] as const;

function nombreRonda(llave: string, ronda: number, total: number, formato: string) {
  const faltan = total - ronda;
  if (llave === "GF") return "Gran final";
  if (llave === "Q") return `Descarte ${ronda}`;
  if (llave === "L") return faltan === 0 ? "Final del lower" : `Lower ${ronda}`;
  if (formato !== "eliminacion" && faltan === 0) return "Final del upper";
  if (faltan === 0) return "Final";
  if (faltan === 1) return "Semifinales";
  if (faltan === 2) return "Cuartos";
  return `Ronda ${ronda}`;
}

export function Cuadro({
  t,
  partidas,
  equipos,
  organiza,
  cambiadas,
}: {
  t: Torneo;
  partidas: Partida[];
  equipos: Equipo[];
  organiza: boolean;
  cambiadas: Set<number>;
}) {
  const nombre: Nombre = (id) => equipos.find((e) => e.id === id)?.nombre;
  // Las partidas de huecos contra huecos no aportan nada: se ocultan.
  const visibles = partidas.filter((p) => !(p.estado === "bye" && p.equipo_a === null && p.equipo_b === null));
  const secciones = SECCIONES.map((s) => ({ ...s, partidas: visibles.filter((p) => p.llave === s.llave) })).filter(
    (s) => s.partidas.length,
  );
  return (
    <div className="space-y-8">
      {secciones.map((s) => {
        const total = Math.max(...s.partidas.map((p) => p.ronda));
        const rondas = Array.from({ length: total }, (_, i) => s.partidas.filter((p) => p.ronda === i + 1)).filter((r) => r.length);
        return (
          <div key={s.llave}>
            {(secciones.length > 1 || t.formato !== "eliminacion") && (
              <h3 className={`mb-3 text-xl ${s.llave === "L" ? "text-dire-claro" : s.llave === "GF" ? "text-oro" : ""}`}>
                {s.titulo}
              </h3>
            )}
            <div className="overflow-x-auto pb-2">
              <ol className="flex min-w-max gap-6">
                {rondas.map((lista) => (
                  <li key={lista[0].ronda} className="flex w-64 flex-col">
                    <h4 className="mb-3 text-niebla">{nombreRonda(s.llave, lista[0].ronda, total, t.formato)}</h4>
                    <ul className="flex flex-1 flex-col justify-around gap-4">
                      {lista.map((p) => (
                        <li key={p.id}>
                          <TarjetaPartida p={p} nombre={nombre} t={t} organiza={organiza} cambiada={cambiadas.has(p.id)} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TarjetaPartida({
  p,
  nombre,
  t,
  organiza,
  cambiada,
}: {
  p: Partida;
  nombre: Nombre;
  t: Torneo;
  organiza: boolean;
  cambiada: boolean;
}) {
  const lista = p.estado === "pendiente" || p.estado === "en_juego";
  const completa = !!(p.equipo_a && p.equipo_b);
  const puedeReportar = organiza && t.estado === "en_curso" && lista && completa;
  const final = !p.sig_ganador;

  const fila = (id: number | null, decidido: number) => {
    const gano = p.ganador != null && p.ganador === id;
    const perdio = p.ganador != null && id != null && p.ganador !== id;
    return (
      <div
        className={`flex min-h-10 items-center justify-between gap-2 px-3 py-2 ${
          gano ? "text-pergamino" : perdio ? "text-niebla line-through decoration-dire/70" : ""
        }`}
      >
        <span className={id ? "" : "text-niebla/60"}>{nombre(id) ?? (decidido ? "Sin rival" : "Por definir")}</span>
        {gano && <span className="size-2 shrink-0 rounded-full bg-radiant shadow-[0_0_8px] shadow-radiant" aria-label="ganó" />}
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
    <div className={`rounded-md border bg-losa ${final ? "border-oro/50" : "border-borde"} ${p.estado === "bye" ? "opacity-60" : ""}`}>
      {p.estado === "en_juego" && <div className="border-b border-borde px-3 py-1 text-sm text-radiant">Jugándose ahora</div>}
      {p.estado === "bye" && <div className="border-b border-borde px-3 py-1 text-sm text-niebla">Pase directo</div>}
      {cambiada && <div className="border-b border-borde px-3 py-1 text-sm text-oro">Cambio de jugadores</div>}
      <div className="divide-y divide-borde">
        {fila(p.equipo_a, p.lista_a)}
        {fila(p.equipo_b, p.lista_b)}
      </div>
      {completa && p.estado === "pendiente" && t.estado === "en_curso" ? (
        <AccionesPartida p={p} t={t} organiza={organiza} />
      ) : completa && p.estado !== "bye" ? (
        <div className="border-t border-borde px-3 py-2">
          <Link href={`/torneos/${t.id}/partida/${p.id}`} className="text-sm text-niebla hover:text-pergamino">
            Jugadores{organiza && p.estado === "en_juego" && t.estado === "en_curso" ? " (cambiar)" : ""}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AccionesPartida({ p, t, organiza }: { p: Partida; t: Torneo; organiza: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-borde px-3 py-2">
      <Formulario accion={accionApostarEnTorneo}>
        <input type="hidden" name="torneo_id" value={t.id} />
        <input type="hidden" name="partida_id" value={p.id} />
        <button className="text-sm text-oro hover:underline">Apostar</button>
      </Formulario>
      <Link href={`/torneos/${t.id}/partida/${p.id}`} className="text-sm text-niebla hover:text-pergamino">
        {organiza ? "Jugadores (cambiar)" : "Jugadores"}
      </Link>
      {organiza && (
        <Formulario accion={accionEnJuego} className="ml-auto">
          <input type="hidden" name="partida_id" value={p.id} />
          <button className="text-sm text-niebla hover:text-pergamino">Empieza</button>
        </Formulario>
      )}
    </div>
  );
}

// --- Liga y suizo: tabla y rondas ---

const fmtPuntos = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ""}½`);

export function TablaPuntos({ filas, nombre, sistema }: { filas: Fila[]; nombre: Nombre; sistema: "liga" | "suizo" }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.07] bg-losa/60">
      <table className="w-full text-left">
        <thead className="text-sm text-niebla">
          <tr>
            <th className="px-4 py-2 font-normal">#</th>
            <th className="py-2 font-normal">Jugador</th>
            <th className="px-2 py-2 text-right font-normal">Puntos</th>
            <th className="px-2 py-2 text-right font-normal" title={sistema === "suizo" ? "Buchholz" : "Sonneborn-Berger"}>
              {sistema === "suizo" ? "Buchholz" : "S-B"}
            </th>
            <th className="px-4 py-2 text-right font-normal">G-T-P</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {filas.map((f, i) => (
            <tr key={f.jugador} className={i === 0 && f.jugadas ? "text-oro" : ""}>
              <td className="cifra px-4 py-2">{i + 1}</td>
              <td className="py-2">{nombre(f.jugador)}</td>
              <td className="cifra px-2 py-2 text-right text-lg">{fmtPuntos(f.puntos)}</td>
              <td className="cifra px-2 py-2 text-right text-niebla">{fmtPuntos(f.desempate)}</td>
              <td className="cifra px-4 py-2 text-right text-niebla">
                {f.ganadas}-{f.tablas}-{f.perdidas}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RondasPuntos({
  t,
  partidas,
  nombre,
  organiza,
  cambiadas,
}: {
  t: Torneo;
  partidas: Partida[];
  nombre: Nombre;
  organiza: boolean;
  cambiadas: Set<number>;
}) {
  const rondas = [...new Set(partidas.map((p) => p.ronda))].sort((a, b) => b - a);
  const etiqueta = (p: Partida) =>
    p.resultado === "tablas" ? "½-½" : p.resultado === "a" ? "1-0" : p.resultado === "b" ? "0-1" : "";
  return (
    <div className="space-y-6">
      {rondas.map((r) => (
        <div key={r}>
          <h3 className="mb-2 text-xl">
            Ronda {r}
            {t.formato === "suizo" ? ` de ${t.rondas}` : ""}
          </h3>
          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
            {partidas
              .filter((p) => p.ronda === r)
              .map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  {p.equipo_b === null ? (
                    <span className="text-niebla">
                      <span className="text-pergamino">{nombre(p.equipo_a)}</span> descansa (1 punto)
                    </span>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="text-niebla">♔</span> {nombre(p.equipo_a)} <span className="text-niebla">contra ♚</span>{" "}
                        {nombre(p.equipo_b)}
                        {cambiadas.has(p.id) && <span className="ml-2 text-sm text-oro">cambio de jugadores</span>}
                      </span>
                      <Link href={`/torneos/${t.id}/partida/${p.id}`} className="text-sm text-niebla hover:text-pergamino">
                        Jugadores
                      </Link>
                      {p.resultado ? (
                        <span className="cifra text-lg text-oro">{etiqueta(p)}</span>
                      ) : organiza && t.estado === "en_curso" ? (
                        <Formulario accion={accionResultado} className="flex gap-1">
                          <input type="hidden" name="partida_id" value={p.id} />
                          {(
                            [
                              ["a", "1-0"],
                              ["tablas", "½-½"],
                              ["b", "0-1"],
                            ] as const
                          ).map(([v, txt]) => (
                            <Enviar key={v} name="resultado" value={v} variante="boton-sobrio" className="cifra px-2.5 py-1 text-sm">
                              {txt}
                            </Enviar>
                          ))}
                        </Formulario>
                      ) : (
                        <span className="text-sm text-niebla">{p.estado === "en_juego" ? "Jugándose" : "Por jugar"}</span>
                      )}
                      {p.estado === "pendiente" && t.estado === "en_curso" && (
                        <Formulario accion={accionApostarEnTorneo}>
                          <input type="hidden" name="torneo_id" value={t.id} />
                          <input type="hidden" name="partida_id" value={p.id} />
                          <button className="text-sm text-oro hover:underline">Apostar</button>
                        </Formulario>
                      )}
                    </>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// --- Lichess ---

export function PanelLichess({
  t,
  url,
  posiciones,
  error,
  equipos,
  yo,
  organiza,
  miLichess,
}: {
  t: Torneo;
  url: string | null;
  posiciones: PosicionLichess[] | null;
  error: string | null;
  equipos: Equipo[];
  yo: number;
  organiza: boolean;
  miLichess: string;
}) {
  const integrantes = equipos.flatMap((e) => e.integrantes);
  const mio = integrantes.find((i) => i.usuario_id === yo);
  const tipo = t.formato === "lichess_arena" ? "Arena" : "Suizo";
  return (
    <section className="panel hud space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">{tipo} en Lichess</h2>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="boton">
            Abrir en Lichess <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </div>
      {(mio || organiza) && t.lichess_clave && t.estado === "en_curso" && (
        <p className="text-niebla">
          Contraseña del torneo, por si entras a mano: <span className="cifra text-pergamino">{t.lichess_clave}</span>{" "}
          <Copiar texto={t.lichess_clave} etiqueta="Copiar la contraseña del torneo" />
        </p>
      )}
      {mio && t.estado === "en_curso" && !mio.lichess_inscrito && (
        <Formulario accion={accionInscribirmeLichess} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="torneo_id" value={t.id} />
          <span className="text-dire-claro">Aún no estás inscrito en Lichess.</span>
          {miLichess ? (
            <Enviar>Inscribirme en Lichess</Enviar>
          ) : (
            <Link href="/perfil" className="boton">
              Conectar mi Lichess
            </Link>
          )}
        </Formulario>
      )}
      <div>
        <h3 className="mb-2 text-xl">Inscritos</h3>
        <ul className="flex flex-wrap gap-2">
          {integrantes.map((i) => (
            <li key={i.usuario_id} className={`chip ${i.lichess_inscrito ? "border-radiant/40 text-radiant" : "border-white/10 text-niebla"}`}>
              {i.usuario} <span className="text-niebla">({i.lichess_usuario})</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl">Clasificación en Lichess</h3>
          {organiza && t.estado === "en_curso" && (
            <Formulario accion={accionSincronizarLichess}>
              <input type="hidden" name="torneo_id" value={t.id} />
              <Enviar variante="boton-sobrio" className="py-1 text-sm">
                <RefreshCw className="size-4" aria-hidden /> Sincronizar
              </Enviar>
            </Formulario>
          )}
        </div>
        {error ? (
          <p className="text-dire-claro">{error}</p>
        ) : !posiciones?.length ? (
          <Vacio>Todavía no hay partidas. La clasificación aparece aquí en cuanto empiecen a jugar.</Vacio>
        ) : (
          <ol className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
            {posiciones.map((p) => (
              <li key={p.usuario} className={`flex items-center gap-3 px-4 py-2 ${p.equipo ? "" : "text-niebla"}`}>
                <span className="cifra w-6">{p.puesto}</span>
                <span className="flex-1">
                  {p.usuario}
                  {!p.equipo && <span className="text-sm"> (no está en El Pozo)</span>}
                </span>
                <span className="cifra text-lg">{p.puntos}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-sm text-niebla">
          Se sincroniza solo cada minuto. Cuando el torneo termine en Lichess, el premio se reparte por esta clasificación
          (solo cuentan los inscritos en El Pozo).
        </p>
      </div>
    </section>
  );
}
