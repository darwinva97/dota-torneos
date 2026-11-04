"use client";

import { useState } from "react";
import { ChessKnight, Swords } from "lucide-react";
import { RITMOS_AJEDREZ, type Juego } from "@/lib/juegos";

// Juego del torneo. En ajedrez es uno contra uno y se elige el ritmo.
export function CamposJuego() {
  const [juego, setJuego] = useState<Juego>("dota2");
  const [ritmo, setRitmo] = useState<string>(RITMOS_AJEDREZ[1].valor);
  const ajedrez = juego === "ajedrez";

  return (
    <>
      <fieldset>
        <legend className="etiqueta">Juego</legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["dota2", "Dota 2", Swords],
              ["ajedrez", "Ajedrez", ChessKnight],
            ] as const
          ).map(([valor, texto, Icono]) => (
            <label key={valor} className="panel flex cursor-pointer items-center gap-3 p-3 has-checked:border-oro">
              <input
                type="radio"
                name="juego"
                value={valor}
                checked={juego === valor}
                onChange={() => setJuego(valor)}
                className="accent-[#e8b54a]"
              />
              <Icono className="size-5 text-oro" aria-hidden />
              <span className="font-medium">{texto}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {ajedrez && (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="etiqueta">Modalidad</span>
            <select value={ritmo} onChange={(e) => setRitmo(e.target.value)} className="campo">
              {RITMOS_AJEDREZ.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.texto}
                </option>
              ))}
              <option value="">Otro ritmo</option>
            </select>
          </label>
          {ritmo === "" ? (
            <label className="block">
              <span className="etiqueta">Ritmo</span>
              <input name="ritmo" required placeholder="armagedón 5+4, 3 partidas…" className="campo" />
            </label>
          ) : (
            <input type="hidden" name="ritmo" value={ritmo} />
          )}
          <p className="text-sm text-niebla sm:col-span-2">
            Partidas uno contra uno. Si una queda en tablas, desempaten (por ejemplo, armagedón) y marca a quien pasa.
          </p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {ajedrez ? (
          <input type="hidden" name="tam_equipo" value="1" />
        ) : (
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
        )}
        <label className="block">
          <span className="etiqueta">{ajedrez ? "Máximo de jugadores" : "Máximo de equipos"}</span>
          <select name="max_equipos" defaultValue={ajedrez ? "8" : "4"} key={juego} className="campo">
            {[2, 3, 4, 5, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
