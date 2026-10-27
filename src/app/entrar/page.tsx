import Link from "next/link";
import type { Metadata } from "next";
import { Formulario, Enviar } from "@/components/formulario";
import { accionEntrar } from "../acciones/cuenta";

export const metadata: Metadata = { title: "Entrar" };

export default function Entrar() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-5xl">Entrar</h1>
      <Formulario accion={accionEntrar} className="space-y-4">
        <label className="block">
          <span className="etiqueta">Usuario</span>
          <input name="usuario" required autoComplete="username" className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Contraseña</span>
          <input name="pass" type="password" required autoComplete="current-password" className="campo" />
        </label>
        <Enviar className="w-full">Entrar</Enviar>
      </Formulario>
      <p className="mt-6 text-niebla">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="text-oro underline underline-offset-4">
          Crea una
        </Link>
        .
      </p>
    </div>
  );
}
