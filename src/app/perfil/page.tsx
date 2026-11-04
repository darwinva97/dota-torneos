import type { Metadata } from "next";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando } from "@/components/ui";
import { accionDesconectarLichess, accionPerfil, accionSalir } from "../acciones/cuenta";
import { LICHESS } from "@/lib/lichess";

export const metadata: Metadata = { title: "Perfil" };

export default function Perfil({ searchParams }: PageProps<"/perfil">) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-5xl">Perfil</h1>
      <Suspense fallback={<Cargando />}>
        <Datos />
        <Lichess searchParams={searchParams} />
      </Suspense>
      <CerrarSesion />
    </div>
  );
}

async function Datos() {
  const u = await exigirUsuario();
  return (
    <Formulario accion={accionPerfil} className="space-y-4">
      <p className="text-niebla">
        Usuario: <span className="text-pergamino">{u.usuario}</span>
      </p>
      <label className="block">
        <span className="etiqueta">Tu nombre</span>
        <input name="nombre" defaultValue={u.nombre} required className="campo" />
      </label>
      <label className="block">
        <span className="etiqueta">Nombre en Yape</span>
        <input name="nombre_yape" defaultValue={u.nombre_yape} required className="campo" />
        <span className="ayuda">Sirve de pista; lo que identifica tu recarga es el monto que declaras.</span>
      </label>
      <label className="block">
        <span className="etiqueta">Nick en Dota</span>
        <input name="nick_dota" defaultValue={u.nick_dota} className="campo" />
      </label>
      <Enviar>Guardar perfil</Enviar>
    </Formulario>
  );
}

function CerrarSesion() {
  return (
    <form action={accionSalir} className="mt-10 border-t border-white/10 pt-6">
      <button className="boton-peligro">Cerrar sesión</button>
    </form>
  );
}

// Cuenta de Lichess conectada por OAuth: para crear torneos allí y para que te
// inscribamos solos en los de ajedrez que se juegan en Lichess.
async function Lichess({ searchParams }: { searchParams: PageProps<"/perfil">["searchParams"] }) {
  const u = await exigirUsuario();
  const { lichess } = await searchParams;
  const aviso = typeof lichess === "string" ? lichess : null;
  return (
    <section className="panel mt-10 space-y-3 p-5">
      <h2 className="text-2xl">Lichess</h2>
      {aviso && (
        <p role="status" className={aviso.startsWith("ok:") ? "text-radiant" : "text-dire-claro"}>
          {aviso.startsWith("ok:") ? `Conectado como ${aviso.slice(3)}.` : aviso}
        </p>
      )}
      {u.lichess_usuario ? (
        <>
          <p>
            Conectado como{" "}
            <a href={`${LICHESS}/@/${u.lichess_usuario}`} target="_blank" rel="noreferrer" className="text-oro underline underline-offset-4">
              {u.lichess_usuario}
            </a>
            . Te inscribimos solos en los torneos de ajedrez que se juegan en Lichess.
          </p>
          <form action={accionDesconectarLichess}>
            <button className="boton-sobrio py-1.5 text-sm">Desconectar</button>
          </form>
        </>
      ) : (
        <>
          <p className="text-niebla">
            Conéctala para jugar los torneos de ajedrez en Lichess (te inscribimos solos y tus resultados cuentan para el
            premio) y para crear torneos allí. Solo pedimos permiso para crear torneos e inscribirte.
          </p>
          <a href="/api/lichess/conectar" className="boton">
            Conectar con Lichess
          </a>
        </>
      )}
    </section>
  );
}
