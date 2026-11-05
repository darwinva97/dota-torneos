import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { historialAcumulado, resumenAcumulado } from "@/lib/acumulado";
import { soles } from "@/lib/dinero";
import { Cargando, Dinero, Stat, Titulo, Vacio, fecha } from "@/components/ui";

export const metadata: Metadata = { title: "Pozo acumulado" };

export default function Pozo() {
  return (
    <>
      <Titulo sub="El pozo de la página: se llena con la parte de las apuestas que no se reparte y se vacía en los premios de los torneos.">
        Pozo acumulado
      </Titulo>
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </>
  );
}

async function Contenido() {
  await connection();
  const r = resumenAcumulado();
  const movs = historialAcumulado(60);
  return (
    <div className="space-y-10">
      <section className="panel hud relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 size-80 rounded-full bg-oro/10 blur-3xl" />
        <p className="relative text-niebla">Hay ahora</p>
        <Dinero centimos={r.saldo} className="relative text-6xl sm:text-7xl" />
        <p className="relative mt-3 max-w-[60ch] text-niebla">
          {r.pagoApuestas < 100
            ? `En cada apuesta, quienes ganan se reparten el ${r.pagoApuestas} % de lo apostado y el ${100 - r.pagoApuestas} % viene aquí. Si una apuesta se anula o nadie acierta, se devuelve todo y no se cobra nada.`
            : "Ahora mismo las apuestas se reparten enteras a quienes ganan, así que el pozo no crece con ellas."}{" "}
          Cuando el admin crea un torneo, decide si el campeón se lleva todo el pozo o solo una parte; lo que no se pone
          queda para el siguiente.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat etiqueta="Ganadores cobran">{r.pagoApuestas} %</Stat>
        <Stat etiqueta="Juntado con apuestas" tono="text-oro">
          {soles(r.deApuestas)}
        </Stat>
        <Stat etiqueta="Puesto en torneos">{soles(r.aTorneos)}</Stat>
      </section>

      <section>
        <h2 className="mb-4 text-2xl">Movimientos</h2>
        {movs.length === 0 ? (
          <Vacio>Todavía no ha entrado nada. Crece cuando se resuelve una apuesta.</Vacio>
        ) : (
          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
            {movs.map((m) => {
              const href = m.mercado_id ? `/apuestas/${m.mercado_id}` : m.torneo_id ? `/torneos/${m.torneo_id}` : null;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    {href ? (
                      <Link href={href} className="block font-medium hover:text-oro">
                        {m.motivo}
                      </Link>
                    ) : (
                      <span className="block font-medium">{m.motivo}</span>
                    )}
                    <span className="text-sm text-niebla">
                      {fecha(m.creado)}, queda {soles(m.saldo_despues)}
                    </span>
                  </span>
                  <Dinero centimos={m.monto} conSigno className="text-lg" />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
