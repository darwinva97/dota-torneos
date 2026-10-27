import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Dices,
  Swords,
  Timer,
  Trophy,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { Movimiento, TipoMovimiento } from "@/lib/billetera";
import { soles } from "@/lib/dinero";
import { Dinero, fecha } from "./ui";

export const TIPOS: Record<TipoMovimiento, { texto: string; Icono: LucideIcon }> = {
  recarga: { texto: "Recarga por Yape", Icono: ArrowDownToLine },
  retiro: { texto: "Retiro a Yape", Icono: ArrowUpFromLine },
  retiro_devuelto: { texto: "Retiro devuelto", Icono: Undo2 },
  inscripcion: { texto: "Entrada a torneo", Icono: Swords },
  inscripcion_devuelta: { texto: "Entrada devuelta", Icono: Undo2 },
  garantia: { texto: "Garantía de puntualidad", Icono: Timer },
  garantia_devuelta: { texto: "Garantía devuelta", Icono: Undo2 },
  premio: { texto: "Premio de torneo", Icono: Trophy },
  apuesta: { texto: "Apuesta", Icono: Dices },
  apuesta_ganada: { texto: "Apuesta ganada", Icono: Coins },
  apuesta_devuelta: { texto: "Apuesta devuelta", Icono: Undo2 },
};

export function ListaMovimientos({
  movimientos,
  conUsuario = false,
  compacta = false,
}: {
  movimientos: (Movimiento & { usuario?: string })[];
  conUsuario?: boolean;
  /** Para columnas estrechas: sin el saldo posterior. */
  compacta?: boolean;
}) {
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07] bg-losa/60">
      {movimientos.map((m) => {
        const { texto, Icono } = TIPOS[m.tipo];
        const entra = m.monto > 0;
        return (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-md ${
                entra ? "bg-radiant/10 text-radiant" : "bg-dire/10 text-dire-claro"
              }`}
            >
              <Icono className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {conUsuario && m.usuario ? <span className="text-oro">{m.usuario}: </span> : null}
                {texto}
              </p>
              <p className="truncate text-sm text-niebla">{m.detalle}</p>
            </div>
            <div className="text-right">
              <Dinero centimos={m.monto} conSigno className="text-lg" />
              <p className="text-xs text-niebla">
                {fecha(m.creado)}
                {!compacta && <span className="hidden sm:inline">, saldo {soles(m.saldo_despues)}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
