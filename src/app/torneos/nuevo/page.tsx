import type { Metadata } from "next";
import { Formulario, Enviar } from "@/components/formulario";
import { accionCrearTorneo } from "../../acciones/torneos";
import { CamposInscripcion } from "./inscripcion";

export const metadata: Metadata = { title: "Crear torneo" };

export default function NuevoTorneo() {
  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-5xl">Crear torneo</h1>
      <p className="mb-8 text-niebla">
        Cada jugador paga la inscripción al unirse a un equipo. El pozo se reparte al terminar la final.
      </p>
      <Formulario accion={accionCrearTorneo} className="space-y-5">
        <label className="block">
          <span className="etiqueta">Nombre</span>
          <input name="nombre" required placeholder="Copa del Barrio" className="campo" />
        </label>
        <CamposInscripcion />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="etiqueta">Jugadores por equipo</span>
            <select name="tam_equipo" defaultValue="5" className="campo">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} contra {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="etiqueta">Máximo de equipos</span>
            <select name="max_equipos" defaultValue="4" className="campo">
              {[2, 3, 4, 5, 6, 8, 12, 16].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="etiqueta">Reparto del pozo</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="panel flex cursor-pointer gap-3 p-3 has-checked:border-oro">
              <input type="radio" name="reparto" value="ganador" defaultChecked className="mt-1 accent-[#e8b54a]" />
              <span>
                <span className="block font-medium">Todo al campeón</span>
                <span className="text-sm text-niebla">El equipo que gana la final se lleva el 100 %.</span>
              </span>
            </label>
            <label className="panel flex cursor-pointer gap-3 p-3 has-checked:border-oro">
              <input type="radio" name="reparto" value="70-30" className="mt-1 accent-[#e8b54a]" />
              <span>
                <span className="block font-medium">70 y 30</span>
                <span className="text-sm text-niebla">70 % al campeón y 30 % al que pierde la final.</span>
              </span>
            </label>
          </div>
        </fieldset>
        <label className="block">
          <span className="etiqueta">Cuándo se juega (opcional)</span>
          <input name="fecha" placeholder="Sábado 9 pm" className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Reglas o notas (opcional)</span>
          <textarea name="descripcion" rows={3} placeholder="All Pick, al mejor de 1, final al mejor de 3…" className="campo" />
        </label>
        <Enviar>Crear torneo</Enviar>
      </Formulario>
    </div>
  );
}
