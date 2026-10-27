import type { ReactNode } from "react";
import { soles } from "@/lib/dinero";

// Moneda de oro al lado de las cifras, como el contador de Dota.
export function Moneda({ className = "size-[0.8em]" }: { className?: string }) {
  return (
    // El degradado «moneda» está en <DegradadosSvg /> del layout.
    <svg viewBox="0 0 16 16" aria-hidden className={`inline-block shrink-0 ${className}`}>
      <circle cx="8" cy="8" r="7" fill="url(#moneda)" />
      <circle cx="8" cy="8" r="4.6" fill="none" stroke="#9a6d12" strokeWidth="1.2" />
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
  const color = conSigno ? (centimos > 0 ? "text-radiant" : centimos < 0 ? "text-dire-claro" : "") : "text-oro";
  return (
    <span className={`cifra inline-flex items-center gap-[0.3em] whitespace-nowrap ${color} ${className}`}>
      {moneda && !conSigno && <Moneda />}
      {conSigno && centimos > 0 ? "+" : ""}
      {soles(centimos)}
    </span>
  );
}

export function Titulo({ children, accion, sub }: { children: ReactNode; accion?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl sm:text-5xl">{children}</h1>
        {sub && <p className="mt-2 max-w-[64ch] text-niebla">{sub}</p>}
      </div>
      {accion}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-hondo/40 px-5 py-8 text-niebla">{children}</div>
  );
}

export function Cargando() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="h-10 w-1/3 animate-pulse rounded bg-losa" />
      <div className="h-28 animate-pulse rounded-lg bg-losa" />
      <div className="h-28 animate-pulse rounded-lg bg-losa" />
    </div>
  );
}

// Cifra con su etiqueta, para las filas de estadísticas.
export function Stat({ etiqueta, children, tono }: { etiqueta: string; children: ReactNode; tono?: string }) {
  return (
    <div className="panel px-4 py-3">
      <p className="text-sm text-niebla">{etiqueta}</p>
      <p className={`cifra mt-0.5 text-2xl ${tono ?? ""}`}>{children}</p>
    </div>
  );
}

const ESTADOS: Record<string, [string, string]> = {
  inscripciones: ["Inscripciones abiertas", "border-oro/40 bg-oro/10 text-oro"],
  en_curso: ["En curso", "border-radiant/40 bg-radiant/10 text-radiant"],
  finalizado: ["Finalizado", "border-white/10 text-niebla"],
  cancelado: ["Cancelado", "border-dire/40 text-dire-claro"],
  abierto: ["Abierta", "border-oro/40 bg-oro/10 text-oro"],
  cerrado: ["Cerrada, esperando resultado", "border-mana/40 bg-mana/10 text-mana"],
  resuelto: ["Resuelta", "border-radiant/40 bg-radiant/10 text-radiant"],
  anulado: ["Anulada", "border-white/10 text-niebla"],
  pendiente: ["Esperando al admin", "border-oro/40 bg-oro/10 text-oro"],
  pagado: ["Pagado", "border-radiant/40 bg-radiant/10 text-radiant"],
  rechazado: ["Rechazado", "border-dire/40 bg-dire/10 text-dire-claro"],
  escuchando: ["Esperando tu Yape", "border-yape/50 bg-yape/15 text-[#d9a6ea]"],
  acreditada: ["Acreditada", "border-radiant/40 bg-radiant/10 text-radiant"],
  revision: ["En revisión", "border-mana/40 bg-mana/10 text-mana"],
  vencida: ["Venció sin pago", "border-white/10 text-niebla"],
  cancelada: ["Cancelada", "border-white/10 text-niebla"],
};

export function Estado({ estado, texto }: { estado: string; texto?: string }) {
  const [porDefecto, clase] = ESTADOS[estado] ?? [estado, "border-white/10"];
  // Las pastillas que esperan algo llevan un punto que late.
  const vivo = ["en_curso", "abierto", "pendiente", "escuchando"].includes(estado);
  return (
    <span className={`chip ${clase}`}>
      {vivo && <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />}
      {texto ?? porDefecto}
    </span>
  );
}

// SQLite guarda UTC sin zona; lo mostramos en hora de Lima.
export function fecha(utc: string, conAnio = false) {
  return new Date(`${utc.replace(" ", "T")}Z`).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "short",
    ...(conAnio ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}
