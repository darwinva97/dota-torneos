"use client";

import { useState } from "react";
import { Formulario, Enviar } from "@/components/formulario";
import { soles } from "@/lib/dinero";
import { accionRetiro } from "../../acciones/billetera";

export function FormularioRetiro({ saldo, ultimoDestino }: { saldo: number; ultimoDestino: string }) {
  const [monto, setMonto] = useState("");
  const rapidos = [1000, 2000, 5000].filter((c) => c <= saldo);

  return (
    <Formulario accion={accionRetiro} className="panel hud space-y-5 p-6">
      <div>
        <p className="text-niebla">Disponible para retirar</p>
        <p className="cifra text-4xl text-oro">{soles(saldo)}</p>
      </div>

      <label className="block">
        <span className="etiqueta">¿Cuánto quieres retirar?</span>
        <div className="flex items-center rounded-md border border-borde bg-hondo focus-within:border-oro focus-within:shadow-[0_0_0_3px_rgb(242_182_50/0.15)]">
          <span className="cifra pl-3 text-niebla">S/</span>
          <input
            name="monto"
            required
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            className="cifra w-full bg-transparent px-2 py-3 text-2xl focus:outline-none"
          />
        </div>
      </label>
      <div className="flex flex-wrap gap-2">
        {rapidos.map((c) => (
          <button key={c} type="button" onClick={() => setMonto(String(c / 100))} className="boton-sobrio px-3 py-1 text-sm">
            {soles(c)}
          </button>
        ))}
        {saldo > 0 && (
          <button
            type="button"
            onClick={() => setMonto((saldo / 100).toFixed(2))}
            className="boton-sobrio px-3 py-1 text-sm"
          >
            Todo
          </button>
        )}
      </div>

      <label className="block">
        <span className="etiqueta">Tu celular de Yape</span>
        <input
          name="destino"
          required
          inputMode="numeric"
          autoComplete="tel"
          defaultValue={ultimoDestino}
          placeholder="987654321"
          className="campo cifra text-lg"
        />
        <span className="ayuda">A este número te yapeará el admin.</span>
      </label>

      <Enviar className="w-full py-3 text-lg">Enviar solicitud de retiro</Enviar>
      <p className="text-sm text-niebla">
        El monto se descuenta de tu saldo al enviar la solicitud. Si el admin la rechaza, o la cancelas antes de que la
        pague, vuelve a tu saldo.
      </p>
    </Formulario>
  );
}
