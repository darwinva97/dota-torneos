import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { exigirUsuario } from "@/lib/sesion";
import { avisosDe } from "@/lib/avisos";
import { solicitudesPendientes } from "@/lib/billetera";
import { Cargando, Titulo, Vacio, fecha } from "@/components/ui";
import { Formulario, Enviar } from "@/components/formulario";
import { accionAvisosLeidos } from "../acciones/cuenta";

export const metadata: Metadata = { title: "Avisos" };

export default function Avisos() {
  return (
    <>
      <Titulo>Avisos</Titulo>
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </>
  );
}

async function Contenido() {
  const u = await exigirUsuario();
  const avisos = avisosDe(u.id);
  const p = u.es_admin ? solicitudesPendientes() : null;
  const delAdmin = p ? p.retiros + p.recargas + p.pagos : 0;
  const sinLeer = avisos.filter((a) => !a.leido).length;
  return (
    <div className="max-w-3xl space-y-6">
      {delAdmin > 0 && (
        <Link href="/admin" className="panel flex items-center gap-3 p-4 hover:border-oro/40">
          <ShieldCheck className="size-5 text-oro" aria-hidden />
          <span className="flex-1">
            {delAdmin} {delAdmin === 1 ? "solicitud" : "solicitudes"} por atender en el admin (retiros, recargas o Yapes).
          </span>
          <ChevronRight className="size-5 text-niebla" aria-hidden />
        </Link>
      )}
      {avisos.length === 0 ? (
        <Vacio>No tienes avisos. Aquí te avisamos, por ejemplo, si te devolvemos una apuesta.</Vacio>
      ) : (
        <>
          {sinLeer > 0 && (
            <Formulario accion={accionAvisosLeidos} sinOk>
              <Enviar variante="boton-sobrio" className="py-1.5 text-sm">
                {sinLeer === 1 ? "Marcar como leído" : `Marcar los ${sinLeer} como leídos`}
              </Enviar>
            </Formulario>
          )}
          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
            {avisos.map((a) => {
              const cuerpo = (
                <>
                  <span className={`mt-2 size-2 shrink-0 rounded-full ${a.leido ? "bg-transparent" : "bg-oro"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={a.leido ? "text-niebla" : ""}>{a.texto}</span>
                    <span className="mt-1 block text-sm text-niebla">{fecha(a.creado)}</span>
                  </span>
                  {a.enlace && <ChevronRight className="mt-1 size-5 shrink-0 text-niebla" aria-hidden />}
                </>
              );
              return (
                <li key={a.id}>
                  {a.enlace ? (
                    <Link href={a.enlace} className="flex gap-3 px-4 py-3 hover:bg-white/[0.03]">
                      {cuerpo}
                    </Link>
                  ) : (
                    <div className="flex gap-3 px-4 py-3">{cuerpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
