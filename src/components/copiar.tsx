"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setHecho(true);
        setTimeout(() => setHecho(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm text-niebla hover:bg-white/5 hover:text-pergamino"
      aria-label={etiqueta}
    >
      {hecho ? <Check className="size-4 text-radiant" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{hecho ? "Copiado" : "Copiar"}</span>
    </button>
  );
}
