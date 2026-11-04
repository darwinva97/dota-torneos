import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { estadoParche, listarMercados, type Mercado } from "@/lib/mercados";
import { soles } from "@/lib/dinero";
import { Cargando, Dinero, Estado, Titulo, Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Apuestas" };

export default function Apuestas() {
  return (
    <>
      <Titulo
        accion={
          <Link href="/apuestas/nueva" className="boton">
            Proponer apuesta
          </Link>
        }
      >
        Apuestas
      </Titulo>
      <p className="-mt-3 mb-8 max-w-[64ch] text-niebla">
        Aparte de la entrada a los torneos. Cada apuesta es un pozo: quienes aciertan se reparten todo lo apostado en
        proporción a lo que pusieron. Si nadie acierta, se devuelve a todos.
      </p>
      <Suspense fallback={<Cargando />}>
        <Listas />
      </Suspense>
    </>
  );
}

async function Listas() {
  await exigirUsuario();
  const activas = listarMercados("activos");
  const cerradas = listarMercados("cerrados");
  return (
    <div className="space-y-10">
      {activas.length === 0 ? (
        <Vacio>No hay apuestas activas. Propón una: «¿Gana Los Rampage el sábado?», «¿Quién saca más kills?»…</Vacio>
      ) : (
        <Tabla lista={activas} />
      )}
      {cerradas.length > 0 && (
        <section>
          <h2 className="mb-4 text-3xl">Terminadas</h2>
          <Tabla lista={cerradas} />
        </section>
      )}
    </div>
  );
}

function Tabla({ lista }: { lista: Mercado[] }) {
  return (
    <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde">
      {lista.map((m) => (
        <li key={m.id}>
          <Link href={`/apuestas/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-losa px-5 py-4 hover:bg-losa-alta">
            <span className="font-medium">{m.titulo}</span>
            <Estado estado={m.estado} />
            <ChipParche m={m} />
            <span className="text-sm text-niebla">
              de {m.creador}, {m.apostadores} {m.apostadores === 1 ? "persona" : "personas"}
            </span>
            <Dinero centimos={m.pozo} className="ml-auto text-2xl" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// En las parchadas abiertas, si ya pueden empezar o cuánto falta.
function ChipParche({ m }: { m: Mercado }) {
  if (m.modalidad !== "parche" || m.estado !== "abierto") return null;
  const p = estadoParche(m.id);
  if (!p) return null;
  return p.parchada ? (
    <Estado estado="resuelto" texto="Parchada" />
  ) : (
    <Estado estado="pendiente"
      texto={p.a.total + p.b.total ? `Faltan ${soles(p.falta)} por ${p.bajo!.etiqueta}` : "Sin apuestas"} />
  );
}
