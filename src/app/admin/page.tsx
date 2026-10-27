import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowUpFromLine, Inbox, ScanSearch } from "lucide-react";
import { exigirAdmin } from "@/lib/sesion";
import {
  movimientosGlobales,
  resumenUsuarios,
  retirosPendientes,
  retirosResueltos,
} from "@/lib/billetera";
import { recargasEnRevision, ultimosPagos } from "@/lib/yape/recargas";
import { soles } from "@/lib/dinero";
import { Formulario, Enviar } from "@/components/formulario";
import { Copiar } from "@/components/copiar";
import { ListaMovimientos } from "@/components/movimientos";
import { Cargando, Dinero, Estado, Stat, Titulo, Vacio, fecha } from "@/components/ui";
import {
  accionAprobarRecarga,
  accionPagarRetiro,
  accionRechazarRecarga,
  accionRechazarRetiro,
  accionSimularPago,
} from "../acciones/billetera";

export const metadata: Metadata = { title: "Admin" };

const PESTANAS = [
  { valor: "yapes", texto: "Yapes recibidos" },
  { valor: "movimientos", texto: "Movimientos" },
  { valor: "retiros", texto: "Retiros resueltos" },
  { valor: "usuarios", texto: "Usuarios" },
] as const;
type Pestana = (typeof PESTANAS)[number]["valor"];

export default function Admin({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <Titulo>Admin</Titulo>
      <Suspense fallback={<Cargando />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await exigirAdmin();
  const { ver } = await searchParams;
  const pestana: Pestana = PESTANAS.some((p) => p.valor === ver) ? (ver as Pestana) : "yapes";
  const retiros = retirosPendientes();
  const revision = recargasEnRevision();
  const usuarios = resumenUsuarios();
  const enCirculacion = usuarios.reduce((s, u) => s + u.saldo, 0);
  const porPagar = retiros.reduce((s, r) => s + r.monto, 0);
  const simulador = process.env.YAPE_SIMULADOR === "1";

  return (
    <div className="space-y-12">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat etiqueta="Saldo de los usuarios" tono="text-oro">
          {soles(enCirculacion)}
        </Stat>
        <Stat etiqueta="Retiros por pagar" tono={porPagar ? "text-dire-claro" : ""}>
          {soles(porPagar)}
        </Stat>
        <Stat etiqueta="Solicitudes abiertas">{retiros.length + revision.length}</Stat>
        <Stat etiqueta="Jugadores">{usuarios.length}</Stat>
      </section>
      <p className="-mt-8 text-sm text-niebla">
        El Yape del pozo debería tener al menos {soles(enCirculacion + porPagar)}: el saldo de todos más los retiros que
        aún no pagas.
      </p>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-3xl">
          <Inbox className="size-7 text-oro" aria-hidden /> Solicitudes
        </h2>
        {retiros.length === 0 && revision.length === 0 ? (
          <Vacio>Nada por atender. Cuando alguien pida un retiro o reclame un Yape, aparecerá aquí.</Vacio>
        ) : (
          <div className="space-y-4">
            {retiros.map((r) => (
              <article key={`w${r.id}`} className="panel hud grid gap-5 p-5 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="flex items-center gap-2 text-sm text-niebla">
                    <ArrowUpFromLine className="size-4 text-oro" aria-hidden /> Retiro pedido el {fecha(r.creado)}
                  </p>
                  <p className="mt-1 text-lg">
                    <span className="font-semibold">{r.usuario}</span>{" "}
                    <span className="text-niebla">({r.nombre_yape})</span> quiere retirar
                  </p>
                  <Dinero centimos={r.monto} className="text-4xl" />
                  <p className="mt-2 flex flex-wrap items-center gap-2">
                    Yapear al <span className="cifra text-xl">{r.destino.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}</span>
                    <Copiar texto={r.destino} etiqueta={`Copiar el número ${r.destino}`} />
                  </p>
                </div>
                <div className="flex min-w-64 flex-col gap-3">
                  <Formulario accion={accionPagarRetiro} className="space-y-2">
                    <input type="hidden" name="retiro_id" value={r.id} />
                    <input name="operacion" placeholder="N.º de operación (opcional)" aria-label="Número de operación de Yape" className="campo" />
                    <Enviar className="w-full">Ya lo yapeé</Enviar>
                  </Formulario>
                  <Formulario accion={accionRechazarRetiro} className="flex gap-2" confirmar="¿Rechazar el retiro? El monto vuelve al saldo del usuario.">
                    <input type="hidden" name="retiro_id" value={r.id} />
                    <input name="motivo" placeholder="Motivo del rechazo" aria-label="Motivo del rechazo" className="campo py-1.5 text-sm" />
                    <Enviar variante="boton-peligro" className="py-1.5 text-sm">
                      Rechazar
                    </Enviar>
                  </Formulario>
                </div>
              </article>
            ))}

            {revision.map((r) => (
              <article key={`r${r.id}`} className="panel grid gap-4 p-5 sm:grid-cols-[8rem_1fr]">
                {r.comprobante ? (
                  <a href={`/api/recargas/${r.id}/comprobante`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API */}
                    <img src={`/api/recargas/${r.id}/comprobante`} alt={`Captura de ${r.usuario}`} className="w-32 rounded border border-borde" />
                  </a>
                ) : (
                  <span className="text-sm text-niebla">Sin captura</span>
                )}
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm text-niebla">
                    <ScanSearch className="size-4 text-mana" aria-hidden /> Recarga por revisar
                  </p>
                  <p>
                    <span className="font-semibold">{r.usuario}</span> dice que este Yape es suyo:
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
                    <dt className="text-niebla">Llegó de</dt>
                    <dd>{r.pago_nombre}</dd>
                    <dt className="text-niebla">Su nombre en Yape</dt>
                    <dd>{r.nombre_yape}</dd>
                    <dt className="text-niebla">Monto</dt>
                    <dd>
                      <Dinero centimos={r.pago_monto ?? 0} moneda={false} />
                    </dd>
                  </dl>
                  {r.pago_estado !== "libre" && (
                    <p className="text-sm text-dire-claro">Ese pago ya se acreditó a otra recarga.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Formulario accion={accionAprobarRecarga}>
                      <input type="hidden" name="recarga_id" value={r.id} />
                      <input type="hidden" name="pago_id" value={r.pago_id ?? ""} />
                      <Enviar>Acreditar {soles(r.pago_monto ?? 0)}</Enviar>
                    </Formulario>
                    <Formulario accion={accionRechazarRecarga}>
                      <input type="hidden" name="recarga_id" value={r.id} />
                      <input type="hidden" name="nota" value="La captura no coincide con el Yape recibido" />
                      <Enviar variante="boton-peligro">Rechazar</Enviar>
                    </Formulario>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1fr_20rem]">
        <section>
          <nav aria-label="Secciones del admin" className="mb-4 flex flex-wrap gap-1 rounded-md bg-hondo/70 p-1">
            {PESTANAS.map((p) => (
              <Link
                key={p.valor}
                href={`/admin?ver=${p.valor}`}
                scroll={false}
                aria-current={p.valor === pestana ? "page" : undefined}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  p.valor === pestana ? "bg-oro text-hondo" : "text-niebla hover:text-pergamino"
                }`}
              >
                {p.texto}
              </Link>
            ))}
          </nav>
          {pestana === "yapes" && <YapesRecibidos />}
          {pestana === "movimientos" && <MovimientosGlobales />}
          {pestana === "retiros" && <RetirosResueltos />}
          {pestana === "usuarios" && (
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
              {usuarios.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="font-medium">{u.usuario}</span>
                    {u.es_admin ? <span className="text-niebla"> (admin)</span> : null}
                    <span className="block text-sm text-niebla">{u.nombre_yape}</span>
                  </span>
                  <Dinero centimos={u.saldo} moneda={false} className="text-lg" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-xl">Observador de Yape</h2>
            <p className="mt-1 text-sm text-niebla">
              {process.env.YAPI_INTEGRACIONES || process.env.YAPE_WEBHOOK_SECRET
                ? "Recibiendo los Yapes que reenvía yapi."
                : "Falta configurar la integración de yapi."}
            </p>
            {simulador && (
              <Formulario accion={accionSimularPago} className="mt-4 space-y-3 border-t border-white/10 pt-4">
                <h3 className="text-lg">Simular un Yape</h3>
                <p className="ayuda !mt-0">Solo para pruebas. Se apaga quitando YAPE_SIMULADOR.</p>
                <input name="nombre" required placeholder="Juan C. Perez R." aria-label="Nombre del que yapea" className="campo" />
                <input name="monto" required inputMode="decimal" aria-label="Monto en soles" placeholder="S/ 20" className="campo" />
                <Enviar variante="boton-sobrio" className="w-full">
                  Enviar Yape simulado
                </Enviar>
              </Formulario>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function YapesRecibidos() {
  const pagos = ultimosPagos();
  if (pagos.length === 0) return <Vacio>El observador todavía no ha reportado ningún pago.</Vacio>;
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
      {pagos.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {p.nombre}
              {p.fuente === "simulador" && <span className="text-sm text-niebla"> (simulado)</span>}
            </span>
            <span className="text-sm text-niebla">
              {new Date(p.recibido).toLocaleString("es-PE", {
                timeZone: "America/Lima",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
          {p.usuario ? (
            <Estado estado="acreditada" texto={`A ${p.usuario}`} />
          ) : (
            <Estado estado="pendiente" texto="Sin asignar" />
          )}
          <Dinero centimos={p.monto} moneda={false} className="w-24 text-right text-lg" />
        </li>
      ))}
    </ul>
  );
}

function MovimientosGlobales() {
  const movs = movimientosGlobales();
  if (movs.length === 0) return <Vacio>Todavía no hay movimientos.</Vacio>;
  return <ListaMovimientos movimientos={movs} conUsuario />;
}

function RetirosResueltos() {
  const retiros = retirosResueltos();
  if (retiros.length === 0) return <Vacio>Todavía no se ha resuelto ningún retiro.</Vacio>;
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
      {retiros.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block">
              <span className="font-medium">{r.usuario}</span> al {r.destino}
            </span>
            <span className="text-sm text-niebla">
              {r.resuelto ? fecha(r.resuelto) : ""}
              {r.operacion ? `, operación ${r.operacion}` : ""}
              {r.nota ? `, ${r.nota}` : ""}
            </span>
          </span>
          <Estado estado={r.estado} texto={r.estado === "cancelado" ? "Cancelado por el usuario" : undefined} />
          <Dinero centimos={r.monto} moneda={false} className="w-24 text-right text-lg" />
        </li>
      ))}
    </ul>
  );
}
