import type { Metadata } from "next";
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
      <NuevaApuesta />
    </div>
  );
}
