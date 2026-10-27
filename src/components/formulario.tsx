"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { Estado } from "@/lib/errores";

type Accion = (estado: Estado, fd: FormData) => Promise<Estado>;

// Formulario de server action con su mensaje de error o de éxito debajo.
export function Formulario({
  accion,
  children,
  className,
  confirmar,
  sinOk = false,
}: {
  accion: Accion;
  children: ReactNode;
  className?: string;
  confirmar?: string;
  /** No mostrar el mensaje de éxito cuando el propio cambio ya se ve. */
  sinOk?: boolean;
}) {
  const [estado, despachar] = useActionState(accion, null);
  return (
    <form
      action={despachar}
      className={className}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {children}
      {estado?.error && (
        <p role="alert" className="mt-2 basis-full text-sm text-dire-claro">
          {estado.error}
        </p>
      )}
      {estado?.ok && !sinOk && (
        <p role="status" className="mt-2 basis-full text-sm text-radiant">
          {estado.ok}
        </p>
      )}
    </form>
  );
}

export function Enviar({
  children,
  variante = "boton",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  variante?: "boton" | "boton-sobrio" | "boton-peligro";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={`${variante} ${className}`}>
      {children}
    </button>
  );
}
