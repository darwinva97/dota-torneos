import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { pagoApuestas } from "@/lib/acumulado";
import { NuevaApuesta } from "./formulario";

export const metadata: Metadata = { title: "Proponer apuesta" };

export default function Pagina() {
  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-5xl">Proponer apuesta</h1>
      <p className="mb-8 text-niebla">
        Tú la creas y tú dices qué opción ganó cuando se sepa. Si algo sale mal, el admin puede anularla y se devuelve
        todo.
      </p>
      <Suspense fallback={<div className="h-96" />}>
        <ConPorcentaje />
      </Suspense>
    </div>
  );
}

// El % que cobran los ganadores se lee en el momento: lo cambia el admin.
async function ConPorcentaje() {
  await connection();
  return <NuevaApuesta pagoPct={pagoApuestas()} />;
}
