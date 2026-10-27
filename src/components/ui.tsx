import type { ReactNode } from "react";
import { soles } from "@/lib/dinero";

// Moneda de oro al lado de las cifras, como el contador de Dota.
export function Moneda({ className = "size-[0.8em]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`inline-block shrink-0 ${className}`}>
      <circle cx="8" cy="8" r="7" fill="#e8b54a" />
      <circle cx="8" cy="8" r="4.6" fill="none" stroke="#b8892b" strokeWidth="1.4" />
    </svg>
  );
}

export function Dinero({
  centimos,
  className = "",
  conSigno = false,
  moneda = true,
}: {
  centimos: number;
  className?: string;
  conSigno?: boolean;
  moneda?: boolean;
}) {
  const color = conSigno ? (centimos > 0 ? "text-radiant" : centimos < 0 ? "text-[#e88a7f]" : "") : "text-oro";
  return (
    <span className={`cifra inline-flex items-center gap-[0.3em] whitespace-nowrap ${color} ${className}`}>
      {moneda && !conSigno && <Moneda />}
      {conSigno && centimos > 0 ? "+" : ""}
      {soles(centimos)}
    </span>
  );
}

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-4xl sm:text-5xl">{children}</h1>
      {accion}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-borde px-5 py-8 text-niebla">{children}</div>;
}

export function Cargando() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="h-10 w-1/3 animate-pulse rounded bg-losa" />
      <div className="h-24 animate-pulse rounded bg-losa" />
      <div className="h-24 animate-pulse rounded bg-losa" />
    </div>
  );
}

const ESTADOS: Record<string, [string, string]> = {
  inscripciones: ["Inscripciones abiertas", "border-oro/50 text-oro"],
  en_curso: ["En curso", "border-radiant/60 text-radiant"],
  finalizado: ["Finalizado", "border-borde text-niebla"],
  cancelado: ["Cancelado", "border-dire/50 text-[#e88a7f]"],
  abierto: ["Abierta", "border-oro/50 text-oro"],
  cerrado: ["Cerrada, esperando resultado", "border-borde text-pergamino"],
  resuelto: ["Resuelta", "border-radiant/60 text-radiant"],
  anulado: ["Anulada", "border-borde text-niebla"],
};

export function Estado({ estado }: { estado: string }) {
  const [texto, clase] = ESTADOS[estado] ?? [estado, "border-borde"];
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-sm ${clase}`}>{texto}</span>;
}
