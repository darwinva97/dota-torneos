import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { costoInscripcion, listarTorneos } from "@/lib/torneos";
import { soles } from "@/lib/dinero";
import { Cargando, Dinero, Estado, Titulo, Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Torneos" };

export default function Torneos() {
  return (
    <>
      <Titulo
        accion={
          <Link href="/torneos/nuevo" className="boton">
            Crear torneo
          </Link>
        }
      >
        Torneos
      </Titulo>
      <Suspense fallback={<Cargando />}>
        <Lista />
      </Suspense>
    </>
  );
}

async function Lista() {
  await exigirUsuario();
  const torneos = listarTorneos();
  if (torneos.length === 0) {
    return <Vacio>Todavía no hay torneos. Crea el primero y pásale el enlace a tu grupo.</Vacio>;
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {torneos.map((t) => (
        <li key={t.id}>
          <Link
            href={`/torneos/${t.id}`}
            className={`panel flex h-full flex-col gap-3 p-5 hover:bg-losa-alta ${t.estado === "cancelado" ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl">{t.nombre}</h2>
              <Estado estado={t.estado} />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-niebla">Inscripción</dt>
                <dd>
                  <Dinero centimos={costoInscripcion(t)} className="text-lg" moneda={false} />
                  {t.garantia > 0 && (
                    <span className="block text-niebla">
                      {soles(t.garantia)} de garantía
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-niebla">Equipos</dt>
                <dd className="cifra text-lg">
                  {t.equipos} de {t.max_equipos}
                </dd>
              </div>
              <div>
                <dt className="text-niebla">Formato</dt>
                <dd className="cifra text-lg">
                  {t.tam_equipo} contra {t.tam_equipo}
                </dd>
              </div>
            </dl>
            <div className="mt-auto flex items-baseline justify-between border-t border-borde pt-3">
              <span className="text-sm text-niebla">
                Organiza {t.organizador}
                {t.fecha ? `, ${t.fecha}` : ""}
              </span>
              <Dinero centimos={t.pozo} className="text-3xl" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
