"use client";

import { useState } from "react";
import { soles } from "@/lib/dinero";

const PARTES = [0, 25, 50, 75, 100];

// Solo el admin: qué parte del pozo acumulado de la página va al premio. Se
// aparta al crear el torneo; el resto queda para el siguiente.
export function CamposAcumulado({ saldo }: { saldo: number }) {
  const [pct, setPct] = useState(0);
  const monto = Math.floor((saldo * pct) / 100);
  return (
    <fieldset className="space-y-3">
      <legend className="etiqueta">Pozo acumulado de la página ({soles(saldo)})</legend>
      <div className="flex flex-wrap gap-2">
        {PARTES.map((p) => (
          <label
            key={p}
            className={`cursor-pointer rounded-md border px-3 py-2 has-checked:border-oro has-checked:bg-oro/10 ${
              saldo === 0 && p > 0 ? "pointer-events-none opacity-40" : "border-borde"
            }`}
          >
            <input
              type="radio"
              name="acumulado_pct"
              value={p}
              checked={pct === p}
              disabled={saldo === 0 && p > 0}
              onChange={() => setPct(p)}
              className="sr-only"
            />
            {p === 0 ? "Nada" : p === 100 ? "Todo" : `${p} %`}
          </label>
        ))}
      </div>
      <p aria-live="polite" className="rounded-md bg-hondo px-3 py-2 text-niebla">
        {pct === 0 ? (
          "El pozo acumulado no entra en este torneo."
        ) : (
          <>
            Se suman <span className="cifra text-oro">{soles(monto)}</span> al premio
            {pct < 100 ? ` y quedan ${soles(saldo - monto)} para el siguiente torneo` : " y el pozo queda en cero"}. Si el
            torneo se cancela, vuelve al pozo.
          </>
        )}
      </p>
    </fieldset>
  );
}
