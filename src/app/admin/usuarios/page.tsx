import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeft, HandCoins, Search } from "lucide-react";
import { exigirAdmin } from "@/lib/sesion";
import { resumenUsuarios } from "@/lib/billetera";
import { soles } from "@/lib/dinero";
import { Cargando, Dinero, Stat, Titulo, Vacio, fecha } from "@/components/ui";

export const metadata: Metadata = { title: "Usuarios" };

export default function Usuarios({ searchParams }: PageProps<"/admin/usuarios">) {
  return (
    <>
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-niebla hover:text-pergamino">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <Titulo>Usuarios</Titulo>
      <Suspense fallback={<Cargando />}>
        <Lista searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Lista({ searchParams }: { searchParams: PageProps<"/admin/usuarios">["searchParams"] }) {
  await exigirAdmin();
  const { q } = await searchParams;
  const busqueda = typeof q === "string" ? q : "";
  const usuarios = resumenUsuarios(busqueda);
  const todos = busqueda ? resumenUsuarios() : usuarios;
  const suma = (k: "saldo" | "debe" | "en_juego" | "en_retiro") => todos.reduce((s, u) => s + u[k], 0);
  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat etiqueta="Saldo de todos" tono="text-oro">
          {soles(suma("saldo"))}
        </Stat>
        <Stat etiqueta="En juego (apuestas y torneos)">{soles(suma("en_juego"))}</Stat>
        <Stat etiqueta="Retiros por pagar">{soles(suma("en_retiro"))}</Stat>
        <Stat etiqueta="Deudas pendientes" tono={suma("debe") ? "text-dire-claro" : ""}>
          {soles(suma("debe"))}
        </Stat>
      </section>

      <form className="flex max-w-md items-center gap-2" role="search">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-borde bg-hondo px-3 focus-within:border-oro">
          <Search className="size-4 text-niebla" aria-hidden />
          <input
            name="q"
            defaultValue={busqueda}
            placeholder="Buscar por usuario, nombre o Lichess"
            aria-label="Buscar usuario"
            className="w-full bg-transparent py-2 focus:outline-none"
          />
        </label>
        <button className="boton-sobrio">Buscar</button>
      </form>

      {usuarios.length === 0 ? (
        <Vacio>No hay usuarios que coincidan con «{busqueda}».</Vacio>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/[0.07] bg-losa/60">
          <table className="w-full min-w-[46rem] text-left">
            <thead className="text-sm text-niebla">
              <tr>
                <th className="px-4 py-2 font-normal">Usuario</th>
                <th className="py-2 text-right font-normal">Saldo</th>
                <th className="py-2 text-right font-normal">En juego</th>
                <th className="py-2 text-right font-normal">Recargó</th>
                <th className="py-2 text-right font-normal">Retiró</th>
                <th className="px-4 py-2 text-right font-normal">Último movimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-2">
                    <Link href={`/admin/usuarios/${u.id}`} className="font-medium text-pergamino hover:text-oro">
                      {u.usuario}
                    </Link>
                    {u.es_admin ? <span className="text-niebla"> (admin)</span> : null}
                    <span className="block text-sm text-niebla">{u.nombre_yape}</span>
                    {u.debe > 0 && (
                      <span className="flex items-center gap-1 text-sm text-dire-claro">
                        <HandCoins className="size-3.5" aria-hidden /> debe {soles(u.debe)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Dinero centimos={u.saldo} moneda={false} className="text-lg" />
                  </td>
                  <td className="cifra py-2 text-right text-niebla">{soles(u.en_juego)}</td>
                  <td className="cifra py-2 text-right text-niebla">{soles(u.recargado)}</td>
                  <td className="cifra py-2 text-right text-niebla">{soles(u.retirado)}</td>
                  <td className="px-4 py-2 text-right text-sm text-niebla">{u.ultimo ? fecha(u.ultimo) : "Nunca"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
