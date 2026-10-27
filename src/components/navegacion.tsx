"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const ENLACES = [
  ["/torneos", "Torneos"],
  ["/apuestas", "Apuestas"],
  ["/billetera", "Billetera"],
] as const;

// El enlace activo depende de la URL, que solo se conoce al pedir la página;
// el fallback pinta los mismos enlaces sin marcar para que el menú salga ya.
export function Navegacion() {
  return (
    <Suspense fallback={<Enlaces ruta="" />}>
      <ConRuta />
    </Suspense>
  );
}

function ConRuta() {
  return <Enlaces ruta={usePathname()} />;
}

function Enlaces({ ruta }: { ruta: string }) {
  return (
    <nav className="flex gap-5">
      {ENLACES.map(([href, texto]) => {
        const activo = ruta.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={`border-b-2 py-1 font-medium transition-colors ${
              activo ? "border-oro text-pergamino" : "border-transparent text-niebla hover:text-pergamino"
            }`}
          >
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
