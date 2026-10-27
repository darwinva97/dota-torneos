import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Clock } from "lucide-react";
import { exigirUsuario } from "@/lib/sesion";
import { GRUPOS, movimientos, resumen, retirosDe, type Grupo } from "@/lib/billetera";
import { recargaAbiertaDe, recargasDe } from "@/lib/yape/recargas";
import { soles } from "@/lib/dinero";
import { Cargando, Dinero, Estado, Stat, Titulo, Vacio, fecha } from "@/components/ui";
import { ListaMovimientos } from "@/components/movimientos";
import { accionAbrirRecarga } from "../acciones/billetera";

export const metadata: Metadata = { title: "Billetera" };

const FILTROS: { valor?: Grupo; texto: string }[] = [
  { texto: "Todo" },
  { valor: "yape", texto: "Yape" },
  { valor: "torneos", texto: "Torneos" },
  { valor: "apuestas", texto: "Apuestas" },
];

export default function Billetera({ searchParams }: PageProps<"/billetera">) {
  return (
    <>
      <Titulo>Billetera</Titulo>
      <Suspense fallback={<Cargando />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/billetera">["searchParams"] }) {
  const u = await exigirUsuario();
  const { ver } = await searchParams;
  const grupo = typeof ver === "string" && ver in GRUPOS ? (ver as Grupo) : undefined;
  const movs = movimientos(u.id, { grupo });
  const r = resumen(u.id);
  const abierta = recargaAbiertaDe(u.id);
  const recargas = recargasDe(u.id).filter((x) => x.estado !== "escuchando").slice(0, 5);
  const retirosPend = retirosDe(u.id).filter((x) => x.estado === "pendiente");

  return (
    <div className="space-y-10">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="panel hud flex flex-col justify-between gap-6 p-6">
          <div>
            <p className="text-niebla">Tu saldo</p>
            <Dinero centimos={u.saldo} className="text-6xl sm:text-7xl" />
            {r.enRetiro > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-niebla">
                <Clock className="size-4" aria-hidden /> {soles(r.enRetiro)} esperando que el admin te los yapee
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {abierta ? (
              <Link href={`/billetera/recargar?r=${abierta.id}`} className="boton">
                <ArrowDownToLine className="size-5" aria-hidden /> Seguir con tu recarga
              </Link>
            ) : (
              <form action={accionAbrirRecarga}>
                <button className="boton">
                  <ArrowDownToLine className="size-5" aria-hidden /> Recargar con Yape
                </button>
              </form>
            )}
            <Link href="/billetera/retirar" className="boton-sobrio">
              <ArrowUpFromLine className="size-5" aria-hidden /> Retirar
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat etiqueta="Recargaste">{soles(r.recargado)}</Stat>
          <Stat etiqueta="Retiraste">{soles(r.retirado)}</Stat>
          <Stat etiqueta="Premios de torneos" tono={r.premios > 0 ? "text-oro" : ""}>
            {soles(r.premios)}
          </Stat>
          <Stat
            etiqueta="Balance en apuestas"
            tono={r.netoApuestas > 0 ? "text-radiant" : r.netoApuestas < 0 ? "text-dire-claro" : ""}
          >
            {r.netoApuestas > 0 ? "+" : ""}
            {soles(r.netoApuestas)}
          </Stat>
        </div>
      </section>

      {retirosPend.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Solicitudes en curso</h2>
          <ul className="space-y-2">
            {retirosPend.map((x) => (
              <li key={x.id}>
                <Link
                  href="/billetera/retirar"
                  className="panel flex flex-wrap items-center gap-3 px-4 py-3 hover:border-oro/30"
                >
                  <ArrowUpFromLine className="size-5 text-oro" aria-hidden />
                  <span>
                    Retiro de <span className="cifra">{soles(x.monto)}</span> al {x.destino}
                  </span>
                  <Estado estado="pendiente" />
                  <span className="ml-auto text-sm text-niebla">pedido el {fecha(x.creado)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl">Historial</h2>
            <nav aria-label="Filtrar historial" className="flex gap-1 rounded-md bg-hondo/70 p-1">
              {FILTROS.map((f) => {
                const activo = f.valor === grupo;
                return (
                  <Link
                    key={f.texto}
                    href={f.valor ? `/billetera?ver=${f.valor}` : "/billetera"}
                    aria-current={activo ? "page" : undefined}
                    scroll={false}
                    className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                      activo ? "bg-oro text-hondo" : "text-niebla hover:text-pergamino"
                    }`}
                  >
                    {f.texto}
                  </Link>
                );
              })}
            </nav>
          </div>
          {movs.length === 0 ? (
            <Vacio>
              {grupo ? "No hay movimientos de este tipo todavía." : "Aún no hay movimientos. Tu primera recarga aparecerá aquí."}
            </Vacio>
          ) : (
            <ListaMovimientos movimientos={movs} />
          )}
        </section>

        <aside>
          <h2 className="mb-4 text-2xl">Recargas recientes</h2>
          {recargas.length === 0 ? (
            <p className="text-niebla">Todavía no has recargado.</p>
          ) : (
            <ul className="space-y-2">
              {recargas.map((x) => (
                <li key={x.id} className="panel flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="cifra block">{x.monto ? soles(x.monto) : "Sin monto"}</span>
                    <span className="text-sm text-niebla">{fecha(x.creado)}</span>
                  </span>
                  <Estado estado={x.estado} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
