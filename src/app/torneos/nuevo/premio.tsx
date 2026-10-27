"use client";

import { useState } from "react";
import { leerSoles, soles } from "@/lib/dinero";

// Premio del torneo: un monto base que pone quien organiza (opcional) y si lo
// recaudado en inscripciones se suma al premio o vuelve al organizador.
export function CamposPremio() {
  const [base, setBase] = useState("");
  const [fijo, setFijo] = useState(false);
  const b = base.trim() ? leerSoles(base) : 0;

  return (
    <fieldset className="space-y-4">
      <legend className="etiqueta">Premio</legend>
      <label className="block">
        <span className="text-sm text-niebla">Premio base que pones tú (opcional)</span>
        <div className="mt-1 flex items-center rounded-md border border-borde bg-hondo focus-within:border-oro">
          <span className="pl-3 text-niebla">S/</span>
          <input
            name="premio_base"
            inputMode="decimal"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent px-2 py-2 focus:outline-none"
          />
        </div>
        <span className="ayuda">Sale de tu saldo al crear el torneo. Si se cancela, te lo devolvemos.</span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-borde px-3 py-2 has-checked:border-oro">
        <input
          type="checkbox"
          name="premio_fijo"
          checked={fijo}
          onChange={(e) => setFijo(e.target.checked)}
          className="mt-1 accent-[#e8b54a]"
        />
        <span>
          <span className="block font-medium">Premio fijo</span>
          <span className="text-sm text-niebla">
            El premio es solo la base. Lo recaudado en inscripciones vuelve a ti al terminar.
          </span>
        </span>
      </label>
      <p aria-live="polite" className="rounded-md bg-hondo px-3 py-2 text-niebla">
        {b === null ? (
          "Escribe el premio base como 50 o 50.50."
        ) : fijo ? (
          b > 0 ? (
            <>
              Se reparten <span className="cifra text-oro">{soles(b)}</span> pase lo que pase. Lo recaudado vuelve a ti.
            </>
          ) : (
            "Con premio fijo necesitas poner un premio base."
          )
        ) : b > 0 ? (
          <>
            Se reparten <span className="cifra text-oro">{soles(b)}</span> más todo lo que se recaude.
          </>
        ) : (
          "Se reparte todo lo que se recaude en inscripciones."
        )}
      </p>
    </fieldset>
  );
}
