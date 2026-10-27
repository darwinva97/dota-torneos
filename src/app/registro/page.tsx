import Link from "next/link";
import type { Metadata } from "next";
import { Formulario, Enviar } from "@/components/formulario";
import { accionRegistro } from "../acciones/cuenta";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function Registro() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-5xl">Crear cuenta</h1>
      <Formulario accion={accionRegistro} className="space-y-4">
        <label className="block">
          <span className="etiqueta">Usuario</span>
          <input name="usuario" required minLength={3} maxLength={20} autoComplete="username" className="campo" />
          <span className="ayuda">Con este nombre te verán los demás.</span>
        </label>
        <label className="block">
          <span className="etiqueta">Tu nombre</span>
          <input name="nombre" required autoComplete="name" className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Nombre en Yape</span>
          <input name="nombre_yape" required placeholder="Juan Carlos Pérez Rojas" className="campo" />
          <span className="ayuda">
            Nombre y apellidos tal como salen cuando yapeas. Así reconocemos tus recargas sin que nadie tenga que
            revisarlas.
          </span>
        </label>
        <label className="block">
          <span className="etiqueta">Nick en Dota (opcional)</span>
          <input name="nick_dota" className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Contraseña</span>
          <input name="pass" type="password" required minLength={8} autoComplete="new-password" className="campo" />
          <span className="ayuda">Mínimo 8 caracteres.</span>
        </label>
        <Enviar className="w-full">Crear cuenta</Enviar>
      </Formulario>
      <p className="mt-6 text-niebla">
        ¿Ya tienes cuenta?{" "}
        <Link href="/entrar" className="text-oro underline underline-offset-4">
          Entra
        </Link>
        .
      </p>
    </div>
  );
}
