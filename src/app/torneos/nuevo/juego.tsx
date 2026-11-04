"use client";

import { useState } from "react";
import { ChessKnight, Swords } from "lucide-react";
import { RITMOS_AJEDREZ, type Juego } from "@/lib/juegos";
import { DURACIONES_ARENA, FORMATOS, esLichess, type Formato } from "@/lib/formatos";

// Juego y formato del torneo. En ajedrez es uno contra uno y se elige el ritmo.
export function CamposJuego({ lichessConectado }: { lichessConectado: boolean }) {
  const [juego, setJuego] = useState<Juego>("dota2");
  const [formato, setFormato] = useState<Formato>("eliminacion");
  const [ritmo, setRitmo] = useState<string>(RITMOS_AJEDREZ[1].valor);
  const ajedrez = juego === "ajedrez";
  const elegir = (j: Juego) => {
    setJuego(j);
    setFormato("eliminacion");
  };

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
                onChange={() => elegir(valor)}
                className="accent-[#e8b54a]"
              />
              <Icono className="size-5 text-oro" aria-hidden />
              <span className="font-medium">{texto}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="etiqueta">Formato</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {FORMATOS[juego].map((f) => (
            <label key={f.valor} className="panel flex cursor-pointer gap-3 p-3 has-checked:border-oro">
              <input
                type="radio"
                name="formato"
                value={f.valor}
                checked={formato === f.valor}
                onChange={() => setFormato(f.valor)}
                className="mt-1 accent-[#e8b54a]"
              />
              <span>
                <span className="block font-medium">{f.texto}</span>
                <span className="text-sm text-niebla">{f.detalle}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {formato === "mixto" && (
        <label className="block max-w-xs">
          <span className="etiqueta">Pasan a upper y lower</span>
          <select name="clasifican" defaultValue="8" className="campo">
            <option value="4">4 equipos</option>
            <option value="8">8 equipos</option>
          </select>
        </label>
      )}
      {(formato === "suizo" || formato === "lichess_suizo") && (
        <label className="block max-w-xs">
          <span className="etiqueta">Rondas</span>
          <input name="rondas" type="number" min={formato === "lichess_suizo" ? 3 : 1} max={15} placeholder="Automático" className="campo" />
          <span className="ayuda">
            {formato === "lichess_suizo" ? "Lichess pide al menos 3." : "Vacío: las justas para que haya un ganador."}
          </span>
        </label>
      )}
      {formato === "lichess_arena" && (
        <label className="block max-w-xs">
          <span className="etiqueta">Duración de la Arena</span>
          <select name="duracion" defaultValue="60" className="campo">
            {DURACIONES_ARENA.map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </label>
      )}
      {formato === "lichess_suizo" && (
        <label className="block">
          <span className="etiqueta">Equipo de Lichess</span>
          <input name="lichess_equipo" required placeholder="mi-club-de-ajedrez" className="campo" />
          <span className="ayuda">
            Lichess solo permite suizos dentro de un equipo del que seas líder: es lo que va tras lichess.org/team/.
          </span>
        </label>
      )}
      {esLichess(formato) && !lichessConectado && (
        <p className="rounded-md border border-dire/40 bg-dire/10 px-3 py-2 text-sm text-dire-claro">
          Para crear el torneo en Lichess tienes que conectar tu cuenta de Lichess en Perfil antes de cerrar las
          inscripciones. Los jugadores también tendrán que conectar la suya para inscribirse.
        </p>
      )}

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
