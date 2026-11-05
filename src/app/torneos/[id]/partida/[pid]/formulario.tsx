"use client";

import { useActionState } from "react";
import { Copiar } from "@/components/copiar";
import { accionCambiarAlineacion } from "../../../../acciones/torneos";

export function FormularioAlineacion({
  partidaId,
  equipoId,
  tamEquipo,
  integrantes,
  enJuego,
  suplentes,
  hayApuestas,
}: {
  partidaId: number;
  equipoId: number;
  tamEquipo: number;
  integrantes: { id: number; usuario: string }[];
  enJuego: number[];
  suplentes: string[];
  hayApuestas: boolean;
}) {
  const [estado, despachar, enviando] = useActionState(accionCambiarAlineacion, null);
  return (
    <details className="border-t border-borde pt-4" open={!!estado}>
      <summary className="cursor-pointer text-oro hover:underline">Cambiar jugadores</summary>
      <form
        action={despachar}
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          if (hayApuestas && !window.confirm("Se devolverá todo lo apostado en esta partida y se abrirá una apuesta nueva. ¿Seguir?")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="partida_id" value={partidaId} />
        <input type="hidden" name="equipo_id" value={equipoId} />
        <fieldset>
          <legend className="etiqueta">Integrantes que juegan</legend>
          <div className="space-y-1.5">
            {integrantes.map((i) => (
              <label key={i.id} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="integrante" value={i.id} defaultChecked={enJuego.includes(i.id)} className="accent-[#e8b54a]" />
                {i.usuario}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="etiqueta">Suplentes (usuarios de la página)</span>
          <input name="suplentes" defaultValue={suplentes.join(", ")} placeholder="@ana, beto" autoCapitalize="none" className="campo" />
          <span className="ayuda">Separados por comas. En total juegan como mucho {tamEquipo}.</span>
        </label>
        <button className="boton" disabled={enviando} aria-busy={enviando}>
          Guardar jugadores
        </button>
        {estado?.error && (
          <p role="alert" className="text-sm text-dire-claro">
            {estado.error}
          </p>
        )}
      </form>
      {estado?.ok && (
        <div role="status" className="mt-4 space-y-2 rounded-md border border-radiant/40 bg-radiant/10 p-3">
          <p className="text-radiant">{estado.ok}</p>
          {estado.mensaje && (
            <>
              <p className="text-sm text-niebla">Mensaje para el grupo:</p>
              <pre className="rounded bg-hondo p-2 text-sm whitespace-pre-wrap">{estado.mensaje}</pre>
              <Copiar texto={estado.mensaje} etiqueta="Copiar el mensaje para el grupo" />
            </>
          )}
        </div>
      )}
    </details>
  );
}
