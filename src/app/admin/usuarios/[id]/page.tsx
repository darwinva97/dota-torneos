import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Gavel, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { exigirAdmin } from "@/lib/sesion";
import { deudasDe, fichaUsuario, movimientos, retirosDe } from "@/lib/billetera";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { ListaMovimientos } from "@/components/movimientos";
import { FilaDeuda } from "@/components/deudas";
import { Cargando, Dinero, Estado, Stat, Vacio, fecha } from "@/components/ui";
import { accionAjustar, accionCambiarAdmin, accionMultar, accionPerdonarDeuda } from "../../../acciones/billetera";

export const metadata: Metadata = { title: "Usuario" };

export default function PaginaUsuario({ params }: PageProps<"/admin/usuarios/[id]">) {
  return (
    <>
      <Link href="/admin/usuarios" className="mb-4 inline-flex items-center gap-1.5 text-niebla hover:text-pergamino">
        <ArrowLeft className="size-4" aria-hidden /> Usuarios
      </Link>
      <Suspense fallback={<Cargando />}>
        <Contenido params={params} />
      </Suspense>
    </>
  );
}

function CampoSoles() {
  return (
    <span className="flex items-center rounded-md border border-borde bg-hondo focus-within:border-oro">
      <span className="pl-3 text-niebla">S/</span>
      <input name="monto" required inputMode="decimal" placeholder="10" aria-label="Monto" className="w-full bg-transparent px-2 py-2 focus:outline-none" />
    </span>
  );
}

async function Contenido({ params }: { params: PageProps<"/admin/usuarios/[id]">["params"] }) {
  const admin = await exigirAdmin();
  const u = fichaUsuario(Number((await params).id));
  if (!u) notFound();
  const movs = movimientos(u.id, { limite: 100 });
  const deudas = deudasDe(u.id);
  const retiros = retirosDe(u.id);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl">
            {u.usuario}
            {u.es_admin ? <span className="ml-3 text-2xl text-oro">admin</span> : null}
          </h1>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 text-niebla">
            <dt>Nombre</dt>
            <dd className="text-pergamino">{u.nombre}</dd>
            <dt>Nombre en Yape</dt>
            <dd className="text-pergamino">{u.nombre_yape}</dd>
            {u.nick_dota && (
              <>
                <dt>Nick en Dota</dt>
                <dd className="text-pergamino">{u.nick_dota}</dd>
              </>
            )}
            {u.lichess_usuario && (
              <>
                <dt>Lichess</dt>
                <dd className="text-pergamino">{u.lichess_usuario}</dd>
              </>
            )}
            <dt>Se registró</dt>
            <dd className="text-pergamino">{fecha(u.creado, true)}</dd>
          </dl>
        </div>
        <div className="text-right">
          <p className="text-niebla">Saldo</p>
          <Dinero centimos={u.saldo} className="text-6xl" />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat etiqueta="Recargó">{soles(u.recargado)}</Stat>
        <Stat etiqueta="Retiró">{soles(u.retirado)}</Stat>
        <Stat etiqueta="En juego">{soles(u.en_juego)}</Stat>
        <Stat etiqueta="Retiros por pagar">{soles(u.en_retiro)}</Stat>
        <Stat etiqueta="Debe" tono={u.debe ? "text-dire-claro" : ""}>
          {soles(u.debe)}
        </Stat>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Formulario accion={accionAjustar} className="panel space-y-3 p-5">
          <h2 className="flex items-center gap-2 text-2xl">
            <SlidersHorizontal className="size-5 text-oro" aria-hidden /> Ajustar saldo
          </h2>
          <input type="hidden" name="usuario_id" value={u.id} />
          <div className="flex gap-2">
            <label className="panel flex flex-1 cursor-pointer items-center gap-2 px-3 py-2 has-checked:border-radiant">
              <input type="radio" name="sentido" value="acreditar" defaultChecked className="accent-[#45c072]" /> Acreditar
            </label>
            <label className="panel flex flex-1 cursor-pointer items-center gap-2 px-3 py-2 has-checked:border-dire">
              <input type="radio" name="sentido" value="descontar" className="accent-[#e2483d]" /> Descontar
            </label>
          </div>
          <CampoSoles />
          <input name="motivo" required placeholder="Pagó en efectivo, corrección…" aria-label="Motivo del ajuste" className="campo" />
          <Enviar className="w-full">Aplicar ajuste</Enviar>
          <p className="ayuda">Para dinero que entra o sale fuera de Yape. Queda en su historial con el motivo.</p>
        </Formulario>

        <Formulario accion={accionMultar} className="panel space-y-3 p-5" confirmar={`¿Multar a ${u.usuario}?`}>
          <h2 className="flex items-center gap-2 text-2xl">
            <Gavel className="size-5 text-dire-claro" aria-hidden /> Poner multa
          </h2>
          <input type="hidden" name="usuario_id" value={u.id} />
          <CampoSoles />
          <input name="motivo" required placeholder="Abandonó la partida, toxicidad…" aria-label="Motivo de la multa" className="campo" />
          <Enviar variante="boton-peligro" className="w-full">
            Multar
          </Enviar>
          <p className="ayuda">
            Va al pozo. Se le retiene lo que tenga y el resto se cobra de lo próximo que recargue o gane; hasta pagarla no
            puede jugar ni retirar.
          </p>
        </Formulario>

        <div className="panel space-y-3 p-5">
          <h2 className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="size-5 text-mana" aria-hidden /> Permisos
          </h2>
          <p className="text-niebla">
            {u.es_admin ? "Es admin: ve este panel, aprueba recargas y paga retiros." : "Es jugador."}
          </p>
          {u.id !== admin.id && (
            <Formulario
              accion={accionCambiarAdmin}
              confirmar={u.es_admin ? `¿Quitarle el admin a ${u.usuario}?` : `¿Hacer admin a ${u.usuario}? Podrá mover saldos.`}
            >
              <input type="hidden" name="usuario_id" value={u.id} />
              <input type="hidden" name="es_admin" value={u.es_admin ? "0" : "1"} />
              <Enviar variante="boton-sobrio" className="w-full">
                {u.es_admin ? "Quitar admin" : "Hacer admin"}
              </Enviar>
            </Formulario>
          )}
        </div>
      </section>

      {deudas.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Deudas y multas</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {deudas.map((d) => (
              <FilaDeuda key={d.id} d={d}>
                {d.estado === "pendiente" && d.deudor_id === u.id && (
                  <Formulario accion={accionPerdonarDeuda} confirmar="¿Perdonar lo que falta?">
                    <input type="hidden" name="deuda_id" value={d.id} />
                    <Enviar variante="boton-sobrio" className="px-3 py-1 text-sm">
                      Perdonar lo que falta
                    </Enviar>
                  </Formulario>
                )}
              </FilaDeuda>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="mb-3 text-2xl">Historial</h2>
          {movs.length === 0 ? <Vacio>Sin movimientos todavía.</Vacio> : <ListaMovimientos movimientos={movs} />}
        </section>
        <aside>
          <h2 className="mb-3 text-2xl">Retiros</h2>
          {retiros.length === 0 ? (
            <p className="text-niebla">No ha pedido retiros.</p>
          ) : (
            <ul className="space-y-2">
              {retiros.map((r) => (
                <li key={r.id} className="panel flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="cifra block">{soles(r.monto)}</span>
                    <span className="text-sm text-niebla">{fecha(r.creado)}</span>
                  </span>
                  <Estado estado={r.estado} texto={r.estado === "cancelado" ? "Cancelado" : undefined} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
