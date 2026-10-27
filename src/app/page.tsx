import Link from "next/link";
import { Suspense } from "react";
import { usuarioActual } from "@/lib/sesion";
import { torneosDe } from "@/lib/torneos";
import { listarMercados } from "@/lib/mercados";
import { Cargando, Dinero, Estado, Vacio } from "@/components/ui";

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
  const abiertas = listarMercados("activos").filter((m) => m.estado === "abierto").slice(0, 6);

  return (
    <div className="space-y-12">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-niebla">Hola, {u.nombre.split(" ")[0]}. Tienes</p>
          <Dinero centimos={u.saldo} className="text-6xl sm:text-7xl" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/billetera" className="boton">
            Recargar con Yape
          </Link>
          <Link href="/torneos/nuevo" className="boton-sobrio">
            Crear torneo
          </Link>
          <Link href="/apuestas/nueva" className="boton-sobrio">
            Proponer apuesta
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-3xl">Tus torneos</h2>
        {mios.length === 0 ? (
          <Vacio>
            No estás en ningún torneo activo.{" "}
            <Link href="/torneos" className="text-oro underline underline-offset-4">
              Mira los que tienen inscripciones abiertas
            </Link>{" "}
            o crea uno para tu grupo.
          </Vacio>
        ) : (
          <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde">
            {mios.map((t) => (
              <li key={t.id}>
                <Link href={`/torneos/${t.id}`} className="flex flex-wrap items-center gap-4 bg-losa px-5 py-4 hover:bg-losa-alta">
                  <span className="cifra text-2xl">{t.nombre}</span>
                  <Estado estado={t.estado} />
                  <span className="ml-auto text-niebla">pozo</span>
                  <Dinero centimos={t.pozo} className="text-2xl" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-3xl">Apuestas abiertas</h2>
        {abiertas.length === 0 ? (
          <Vacio>
            Nadie ha propuesto nada todavía. ¿Quién saca más kills en la próxima, o si alguien llega a 5k de MMR este
            mes?{" "}
            <Link href="/apuestas/nueva" className="text-oro underline underline-offset-4">
              Proponla tú
            </Link>
            .
          </Vacio>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {abiertas.map((m) => (
              <li key={m.id}>
                <Link href={`/apuestas/${m.id}`} className="panel flex h-full flex-col gap-2 p-4 hover:bg-losa-alta">
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
  );
}

function Portada() {
  return (
    <div className="grid items-center gap-12 py-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <h1 className="text-6xl leading-[0.95] sm:text-7xl">
          Arma el torneo.
          <br />
          Pon tu entrada.
          <br />
          Que hable el Ancient.
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg text-niebla">
          Torneos de Dota 2 para tu grupo de amigos: cada equipo pone su entrada, el pozo se lo lleva quien gana el
          cuadro. Y aparte, apuestas sobre lo que quieran. Recargas con Yape y se acreditan solas.
        </p>
        <div className="mt-8 flex gap-3">
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
    <div className={`flex items-center justify-between px-3 py-1.5 ${gana ? "text-pergamino" : "text-niebla line-through decoration-dire/70"}`}>
      <span>{nombre}</span>
      {gana && <span className="size-2 rounded-full bg-radiant" aria-label="ganó" />}
    </div>
  );
  return (
    <div className="panel p-6" aria-label="Ejemplo de cuadro de torneo">
      <div className="mb-5 flex items-baseline justify-between">
        <span className="cifra text-xl">Copa del Barrio</span>
        <span className="flex items-baseline gap-2 text-niebla">
          pozo <Dinero centimos={40000} className="text-3xl" />
        </span>
      </div>
      <div className="grid grid-cols-2 items-center gap-6">
        <div className="space-y-4">
          <div className="divide-y divide-borde rounded border border-borde">
            {fila("Los Rampage", true)}
            {fila("Feed Squad", false)}
          </div>
          <div className="divide-y divide-borde rounded border border-borde">
            {fila("Aegis o Nada", false)}
            {fila("Tilt Gaming", true)}
          </div>
        </div>
        <div className="divide-y divide-borde rounded border border-oro/50">
          {fila("Los Rampage", true)}
          {fila("Tilt Gaming", false)}
        </div>
      </div>
    </div>
  );
}
