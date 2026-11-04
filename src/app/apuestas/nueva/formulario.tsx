"use client";

import { useState } from "react";
import { Formulario, Enviar } from "@/components/formulario";
import { accionCrearApuesta } from "../../acciones/apuestas";

export function NuevaApuesta() {
  const [opciones, setOpciones] = useState(["Sí", "No"]);
  const [modalidad, setModalidad] = useState<"parche" | "pozo">("parche");
  // El parche es siempre de dos bandos.
  const visibles = modalidad === "parche" ? opciones.slice(0, 2) : opciones;
  return (
    <Formulario accion={accionCrearApuesta} className="space-y-5">
      <fieldset>
        <legend className="etiqueta">Modalidad</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="panel flex cursor-pointer gap-3 p-3 has-checked:border-oro">
            <input
              type="radio"
              name="modalidad"
              value="parche"
              checked={modalidad === "parche"}
              onChange={() => setModalidad("parche")}
              className="mt-1 accent-[#e8b54a]"
            />
            <span>
              <span className="block font-medium">Parche 1 a 1</span>
              <span className="text-sm text-niebla">
                Dos bandos. Solo empieza cuando lo apostado a cada uno es igual; quien gana cobra el doble.
              </span>
            </span>
          </label>
          <label className="panel flex cursor-pointer gap-3 p-3 has-checked:border-oro">
            <input
              type="radio"
              name="modalidad"
              value="pozo"
              checked={modalidad === "pozo"}
              onChange={() => setModalidad("pozo")}
              className="mt-1 accent-[#e8b54a]"
            />
            <span>
              <span className="block font-medium">Pozo común</span>
              <span className="text-sm text-niebla">
                Varias opciones. Quienes aciertan se reparten todo en proporción a lo que pusieron.
              </span>
            </span>
          </label>
        </div>
      </fieldset>
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
        <legend className="etiqueta">{modalidad === "parche" ? "Bandos" : "Opciones"}</legend>
        <ul className="space-y-2">
          {visibles.map((o, i) => (
            <li key={i} className="flex gap-2">
              <input
                name="opcion"
                required
                value={o}
                onChange={(e) => setOpciones(opciones.map((x, k) => (k === i ? e.target.value : x)))}
                aria-label={`Opción ${i + 1}`}
                className="campo"
              />
              {modalidad === "pozo" && opciones.length > 2 && (
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
        {modalidad === "pozo" && opciones.length < 8 && (
          <button type="button" onClick={() => setOpciones([...opciones, ""])} className="mt-2 text-oro hover:underline">
            Añadir opción
          </button>
        )}
      </fieldset>
      <Enviar>Publicar apuesta</Enviar>
    </Formulario>
  );
}
