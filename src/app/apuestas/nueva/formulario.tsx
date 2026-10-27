"use client";

import { useState } from "react";
import { Formulario, Enviar } from "@/components/formulario";
import { accionCrearApuesta } from "../../acciones/apuestas";

export function NuevaApuesta() {
  const [opciones, setOpciones] = useState(["Sí", "No"]);
  return (
    <Formulario accion={accionCrearApuesta} className="space-y-5">
      <label className="block">
        <span className="etiqueta">¿Sobre qué apostamos?</span>
        <input name="titulo" required placeholder="¿Gana Los Rampage la final del sábado?" className="campo" />
      </label>
      <label className="block">
        <span className="etiqueta">Detalles (opcional)</span>
        <textarea
          name="descripcion"
          rows={2}
          placeholder="Cuenta solo la partida del sábado. Si no se juega, se anula."
          className="campo"
        />
      </label>
      <fieldset>
        <legend className="etiqueta">Opciones</legend>
        <ul className="space-y-2">
          {opciones.map((o, i) => (
            <li key={i} className="flex gap-2">
              <input
                name="opcion"
                required
                value={o}
                onChange={(e) => setOpciones(opciones.map((x, k) => (k === i ? e.target.value : x)))}
                aria-label={`Opción ${i + 1}`}
                className="campo"
              />
              {opciones.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOpciones(opciones.filter((_, k) => k !== i))}
                  className="boton-sobrio px-3"
                  aria-label={`Quitar opción ${i + 1}`}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
        {opciones.length < 8 && (
          <button type="button" onClick={() => setOpciones([...opciones, ""])} className="mt-2 text-oro hover:underline">
            Añadir opción
          </button>
        )}
      </fieldset>
      <Enviar>Publicar apuesta</Enviar>
    </Formulario>
  );
}
