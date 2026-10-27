import type { Metadata } from "next";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { Formulario, Enviar } from "@/components/formulario";
import { Cargando } from "@/components/ui";
import { accionPerfil, accionSalir } from "../acciones/cuenta";

export const metadata: Metadata = { title: "Perfil" };

export default function Perfil() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-5xl">Perfil</h1>
      <Suspense fallback={<Cargando />}>
        <Datos />
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
        <span className="ayuda">Si no coincide con tu Yape, tus recargas esperarán a que el admin las revise.</span>
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
