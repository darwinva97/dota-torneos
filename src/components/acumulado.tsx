import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Landmark } from "lucide-react";
import { resumenAcumulado } from "@/lib/acumulado";
import { Dinero } from "./ui";

// Pozo acumulado de la página, a la vista de todos. Se lee en el momento:
// cambia con cada apuesta que se resuelve.
export function PozoAcumulado({ variante = "tarjeta" }: { variante?: "tarjeta" | "lateral" }) {
  return (
    <Suspense fallback={<span className={variante === "lateral" ? "block h-14" : "block h-24"} />}>
      <Datos variante={variante} />
    </Suspense>
  );
}

async function Datos({ variante }: { variante: "tarjeta" | "lateral" }) {
  await connection();
  const r = resumenAcumulado();
  if (variante === "lateral") {
    return (
      <Link href="/pozo" className="block rounded-md border border-oro/25 bg-oro/[0.06] px-3 py-2.5 hover:border-oro/50">
        <span className="flex items-center gap-1.5 text-sm text-niebla">
          <Landmark className="size-4 text-oro" aria-hidden /> Pozo acumulado
        </span>
        <Dinero centimos={r.saldo} className="text-2xl" />
      </Link>
    );
  }
  return (
    <Link
      href="/pozo"
      className="panel flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-5 hover:border-oro/40"
    >
      <span>
        <span className="flex items-center gap-2 text-niebla">
          <Landmark className="size-5 text-oro" aria-hidden /> Pozo acumulado de la página
        </span>
        <span className="mt-1 block max-w-[52ch] text-sm text-niebla">
          {r.pagoApuestas < 100
            ? `Crece con el ${100 - r.pagoApuestas} % de cada apuesta resuelta. El admin lo pone como premio en los torneos.`
            : "El admin lo pone como premio en los torneos."}
        </span>
      </span>
      <Dinero centimos={r.saldo} className="text-4xl sm:text-5xl" />
    </Link>
  );
}
