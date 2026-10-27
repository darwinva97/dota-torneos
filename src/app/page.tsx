import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Dices, Swords, Timer, Trophy } from "lucide-react";
import { usuarioActual } from "@/lib/sesion";
import { torneosDe } from "@/lib/torneos";
import { listarMercados } from "@/lib/mercados";
import { movimientos, resumen } from "@/lib/billetera";
import { soles } from "@/lib/dinero";
import { Cargando, Dinero, Estado, Stat, Vacio } from "@/components/ui";
import { ListaMovimientos } from "@/components/movimientos";
import { accionAbrirRecarga } from "./acciones/billetera";

export default function Inicio() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const u = await usuarioActual();
  if (!u) return <Portada />;

  const mios = torneosDe(u.id);
  const abiertas = listarMercados("activos").filter((m) => m.estado === "abierto").slice(0, 4);
  const recientes = movimientos(u.id, { limite: 5 });
  const r = resumen(u.id);

  return (
    <div className="space-y-12">
      <section className="panel hud relative overflow-hidden p-6 sm:p-8">
        {/* Resplandor detrás del saldo: lo único que brilla en la pantalla. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-16 size-80 rounded-full bg-oro/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-niebla">Hola, {u.nombre.split(" ")[0]}. Tu oro:</p>
            <Dinero centimos={u.saldo} className="text-6xl sm:text-7xl" />
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={accionAbrirRecarga}>
              <button className="boton">
                <ArrowDownToLine className="size-5" aria-hidden /> Recargar
              </button>
            </form>
            <Link href="/billetera/retirar" className="boton-sobrio">
              <ArrowUpFromLine className="size-5" aria-hidden /> Retirar
            </Link>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AccesoRapido href="/torneos/nuevo" Icono={Swords} texto="Crear torneo" />
          <AccesoRapido href="/apuestas/nueva" Icono={Dices} texto="Proponer apuesta" />
          <AccesoRapido href="/torneos" Icono={Trophy} texto="Ver torneos" />
          <AccesoRapido href="/apuestas" Icono={Timer} texto="Apuestas abiertas" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat etiqueta="Premios ganados" tono={r.premios ? "text-oro" : ""}>
          {soles(r.premios)}
        </Stat>
        <Stat etiqueta="Balance en apuestas" tono={r.netoApuestas > 0 ? "text-radiant" : r.netoApuestas < 0 ? "text-dire-claro" : ""}>
          {r.netoApuestas > 0 ? "+" : ""}
          {soles(r.netoApuestas)}
        </Stat>
        <Stat etiqueta="Torneos activos">{mios.length}</Stat>
        <Stat etiqueta="En retiro" tono={r.enRetiro ? "text-oro" : ""}>
          {soles(r.enRetiro)}
        </Stat>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-10">
          <section>
            <EncabezadoSeccion titulo="Tus torneos" href="/torneos" enlace="Todos los torneos" />
            {mios.length === 0 ? (
              <Vacio>
                No estás en ningún torneo activo.{" "}
                <Link href="/torneos" className="text-oro underline underline-offset-4">
                  Mira los que tienen inscripciones abiertas
                </Link>{" "}
                o crea uno para tu grupo.
              </Vacio>
            ) : (
              <ul className="space-y-3">
                {mios.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/torneos/${t.id}`}
                      className="panel flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:border-oro/30"
                    >
                      <Trophy className="size-6 text-oro" aria-hidden />
                      <span className="cifra text-xl">{t.nombre}</span>
                      <Estado estado={t.estado} />
                      <span className="ml-auto flex items-baseline gap-2 text-niebla">
                        pozo <Dinero centimos={t.pozo} className="text-2xl" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <EncabezadoSeccion titulo="Apuestas abiertas" href="/apuestas" enlace="Todas las apuestas" />
            {abiertas.length === 0 ? (
              <Vacio>
                Nadie ha propuesto nada todavía. ¿Quién saca más kills en la próxima?{" "}
                <Link href="/apuestas/nueva" className="text-oro underline underline-offset-4">
                  Propón una apuesta
                </Link>
                .
              </Vacio>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {abiertas.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/apuestas/${m.id}`}
                      className="panel flex h-full flex-col gap-3 p-4 transition-colors hover:border-oro/30"
                    >
                      <span className="font-medium">{m.titulo}</span>
                      <span className="mt-auto flex items-center justify-between text-sm text-niebla">
                        <span>
                          {m.apostadores} {m.apostadores === 1 ? "persona" : "personas"}
                        </span>
                        <Dinero centimos={m.pozo} className="text-lg" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section>
          <EncabezadoSeccion titulo="Actividad" href="/billetera" enlace="Historial completo" />
          {recientes.length === 0 ? (
            <Vacio>Tus recargas, entradas, apuestas y premios aparecerán aquí.</Vacio>
          ) : (
            <ListaMovimientos movimientos={recientes} compacta />
          )}
        </section>
      </div>
    </div>
  );
}

function EncabezadoSeccion({ titulo, href, enlace }: { titulo: string; href: string; enlace: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-2xl">{titulo}</h2>
      <Link href={href} className="flex items-center text-sm text-niebla hover:text-oro">
        {enlace} <ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function AccesoRapido({ href, Icono, texto }: { href: string; Icono: typeof Trophy; texto: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-hondo/60 px-3 py-3 transition-colors hover:border-oro/30 hover:bg-hondo"
    >
      <Icono className="size-5 text-oro" strokeWidth={1.75} aria-hidden />
      <span className="text-sm font-medium">{texto}</span>
    </Link>
  );
}

function Portada() {
  return (
    <div className="grid items-center gap-12 py-4 lg:grid-cols-[1.1fr_1fr] lg:py-10">
      <div>
        <h1 className="text-5xl leading-[0.95] sm:text-7xl">
          Arma el torneo.
          <br />
          Pon tu oro.
          <br />
          Que hable el Ancient.
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg text-niebla">
          Torneos de Dota 2 para tu grupo: cada jugador pone su entrada, el pozo se lo lleva quien gana el cuadro. Aparte,
          apuestas sobre lo que quieran. Recargas por Yape que se acreditan solas y retiros que paga el admin.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/registro" className="boton px-6 py-3 text-lg">
            Crear cuenta
          </Link>
          <Link href="/entrar" className="boton-sobrio px-6 py-3 text-lg">
            Ya tengo cuenta
          </Link>
        </div>
      </div>
      <CuadroMuestra />
    </div>
  );
}

// Un cuadro de ejemplo para que se entienda de un vistazo de qué va.
function CuadroMuestra() {
  const fila = (nombre: string, gana: boolean) => (
    <div
      className={`flex items-center justify-between px-3 py-2 ${
        gana ? "text-pergamino" : "text-niebla line-through decoration-dire/70"
      }`}
    >
      <span>{nombre}</span>
      {gana && <span className="size-2 rounded-full bg-radiant shadow-[0_0_8px] shadow-radiant" aria-label="ganó" />}
    </div>
  );
  return (
    <div className="panel hud p-6" aria-label="Ejemplo de cuadro de torneo">
      <div className="mb-6 flex items-baseline justify-between">
        <span className="cifra text-xl">Copa del Barrio</span>
        <span className="flex items-baseline gap-2 text-niebla">
          pozo <Dinero centimos={40000} className="text-3xl" />
        </span>
      </div>
      <div className="grid grid-cols-2 items-center gap-6">
        <div className="space-y-4">
          <div className="divide-y divide-white/[0.06] rounded-md border border-white/10 bg-hondo/60">
            {fila("Los Rampage", true)}
            {fila("Feed Squad", false)}
          </div>
          <div className="divide-y divide-white/[0.06] rounded-md border border-white/10 bg-hondo/60">
            {fila("Aegis o Nada", false)}
            {fila("Tilt Gaming", true)}
          </div>
        </div>
        <div className="divide-y divide-white/[0.06] rounded-md border border-oro/50 bg-hondo/60 shadow-[0_0_24px_-8px] shadow-oro/40">
          {fila("Los Rampage", true)}
          {fila("Tilt Gaming", false)}
        </div>
      </div>
    </div>
  );
}
