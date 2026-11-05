import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { exigirUsuario } from "@/lib/sesion";
import { equiposDe, partidasDe, torneo } from "@/lib/torneos";
import { alineacion, alineacionCambiada } from "@/lib/alineaciones";
import { db } from "@/lib/db";
import { Cargando, Dinero, Estado } from "@/components/ui";
import { FormularioAlineacion } from "./formulario";

export const metadata: Metadata = { title: "Jugadores de la partida" };

export default function PaginaPartida({ params }: PageProps<"/torneos/[id]/partida/[pid]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: PageProps<"/torneos/[id]/partida/[pid]">["params"] }) {
  const u = await exigirUsuario();
  const { id, pid } = await params;
  const t = torneo(Number(id));
  const p = t ? partidasDe(t.id).find((x) => x.id === Number(pid)) : undefined;
  if (!t || !p || !p.equipo_a || !p.equipo_b) notFound();
  const equipos = equiposDe(t.id);
  const organiza = t.organizador_id === u.id || !!u.es_admin;
  const editable = organiza && t.estado === "en_curso" && (p.estado === "pendiente" || p.estado === "en_juego");
  const apuesta = db()
    .prepare(
      `SELECT m.id, COALESCE((SELECT SUM(monto) FROM jugadas j WHERE j.mercado_id = m.id), 0) AS pozo
       FROM mercados m WHERE m.partida_id = ? AND m.estado IN ('abierto', 'cerrado') ORDER BY m.id DESC LIMIT 1`,
    )
    .get(p.id) as { id: number; pozo: number } | undefined;
  const lados = [p.equipo_a, p.equipo_b].map((eid) => {
    const e = equipos.find((x) => x.id === eid)!;
    return { equipo: e, jugadores: alineacion(p.id, e.id) };
  });

  return (
    <div className="max-w-4xl space-y-8">
      <Link href={`/torneos/${t.id}`} className="inline-flex items-center gap-1.5 text-niebla hover:text-pergamino">
        <ArrowLeft className="size-4" aria-hidden /> {t.nombre}
      </Link>
      <header>
        <div className="mb-2 flex flex-wrap gap-2">
          <Estado
            estado={p.estado === "jugada" ? "finalizado" : p.estado === "en_juego" ? "en_curso" : "inscripciones"}
            texto={p.estado === "jugada" ? "Jugada" : p.estado === "en_juego" ? "Jugándose" : "Por jugar"}
          />
          {alineacionCambiada(p.id) && <Estado estado="cerrado" texto="Hubo cambio de jugadores" />}
        </div>
        <h1 className="text-4xl sm:text-5xl">
          {lados[0].equipo.nombre} <span className="text-niebla">contra</span> {lados[1].equipo.nombre}
        </h1>
        {apuesta && (
          <p className="mt-3 text-niebla">
            Hay <Dinero centimos={apuesta.pozo} className="text-lg" /> apostados en esta partida.{" "}
            <Link href={`/apuestas/${apuesta.id}`} className="text-oro hover:underline">
              Ver la apuesta
            </Link>
          </p>
        )}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
        {lados.map(({ equipo, jugadores }) => (
          <section key={equipo.id} className="panel space-y-4 p-5">
            <h2 className="text-2xl">{equipo.nombre}</h2>
            <ul className="space-y-1.5">
              {jugadores.map((j) => (
                <li key={j.usuario_id} className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded bg-losa-alta text-sm font-semibold">
                    {j.usuario[0]?.toUpperCase()}
                  </span>
                  {j.usuario}
                  {j.suplente && <span className="text-sm text-oro">suplente</span>}
                </li>
              ))}
            </ul>
            {editable && (
              <FormularioAlineacion
                partidaId={p.id}
                equipoId={equipo.id}
                tamEquipo={t.tam_equipo}
                integrantes={equipo.integrantes.map((i) => ({ id: i.usuario_id, usuario: i.usuario }))}
                enJuego={jugadores.filter((j) => !j.suplente).map((j) => j.usuario_id)}
                suplentes={jugadores.filter((j) => j.suplente).map((j) => j.usuario)}
                hayApuestas={!!apuesta && apuesta.pozo > 0}
              />
            )}
          </section>
        ))}
      </div>
      <p className="max-w-[64ch] text-sm text-niebla">
        Si cambia quién juega, lo apostado en esta partida se devuelve a cada uno y se abre una apuesta nueva, vacía.
        Quienes habían apostado reciben un aviso para decidir si vuelven a apostar. El premio del torneo sigue siendo de
        los integrantes inscritos del equipo.
      </p>
    </div>
  );
}
