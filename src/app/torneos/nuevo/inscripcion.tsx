"use client";

import { useState } from "react";
import { leerSoles, soles } from "@/lib/dinero";

// Precio de la inscripción: lo que va al pozo y, opcionalmente, una garantía de
// puntualidad que se devuelve a quien llega a tiempo.
export function CamposInscripcion() {
  const [entrada, setEntrada] = useState("2");
  const [conGarantia, setConGarantia] = useState(false);
  const [garantia, setGarantia] = useState("6");
  const [limite, setLimite] = useState("");

  const e = leerSoles(entrada);
  const g = conGarantia ? leerSoles(garantia) : 0;

  return (
    <fieldset className="space-y-4">
      <legend className="etiqueta">Inscripción por jugador</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-niebla">Va al pozo</span>
          <Soles name="entrada" valor={entrada} onChange={setEntrada} />
        </label>
        <label className="flex cursor-pointer items-start gap-3 self-end rounded-md border border-borde px-3 py-2 has-checked:border-oro">
          <input
            type="checkbox"
            name="con_garantia"
            checked={conGarantia}
            onChange={(ev) => setConGarantia(ev.target.checked)}
            className="mt-1 accent-[#e8b54a]"
          />
          <span>
            <span className="block font-medium">Garantía de puntualidad</span>
            <span className="text-sm text-niebla">Se devuelve si llega a tiempo; si falta, va al pozo.</span>
          </span>
        </label>
      </div>

      {conGarantia && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-niebla">Garantía</span>
            <Soles name="garantia" valor={garantia} onChange={setGarantia} />
          </label>
          <label className="block">
            <span className="text-sm text-niebla">Hay que llegar antes de (opcional)</span>
            <input
              name="limite_llegada"
              value={limite}
              onChange={(ev) => setLimite(ev.target.value)}
              placeholder="8:45 pm, al lobby"
              className="campo"
            />
          </label>
        </div>
      )}

      <p aria-live="polite" className="rounded-md bg-noche px-3 py-2 text-niebla">
        {e === null || g === null ? (
          "Escribe montos como 2 o 6.50."
        ) : g > 0 ? (
          <>
            Cada jugador paga <span className="cifra text-oro">{soles(e + g)}</span>: {soles(e)} al pozo y {soles(g)} de
            garantía, que se le devuelve si llega a tiempo.
          </>
        ) : (
          <>
            Cada jugador paga <span className="cifra text-oro">{soles(e)}</span>, todo al pozo.
          </>
        )}
      </p>
    </fieldset>
  );
}

function Soles({ name, valor, onChange }: { name: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 flex items-center rounded-md border border-borde bg-noche focus-within:border-oro">
      <span className="pl-3 text-niebla">S/</span>
      <input
        name={name}
        required
        inputMode="decimal"
        value={valor}
        onChange={(ev) => onChange(ev.target.value)}
        className="w-full bg-transparent px-2 py-2 focus:outline-none"
      />
    </div>
  );
}
