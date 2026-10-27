"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dices, House, ShieldCheck, Trophy, Wallet, type LucideIcon } from "lucide-react";

type Item = { href: string; texto: string; Icono: LucideIcon };

const ITEMS: Item[] = [
  { href: "/", texto: "Inicio", Icono: House },
  { href: "/torneos", texto: "Torneos", Icono: Trophy },
  { href: "/apuestas", texto: "Apuestas", Icono: Dices },
  { href: "/billetera", texto: "Billetera", Icono: Wallet },
];
const ADMIN: Item = { href: "/admin", texto: "Admin", Icono: ShieldCheck };

type Props = {
  variante: "lateral" | "inferior";
  /** null si no es admin; si lo es, cuántas solicitudes esperan. */
  admin: number | null;
};

// El enlace activo depende de la URL, que solo existe al pedir la página: este
// componente va dentro de <Suspense> y su fallback es <EnlacesNav ruta="" />.
export function NavActiva(props: Props) {
  return <EnlacesNav {...props} ruta={usePathname()} />;
}

export function EnlacesNav({ variante, admin, ruta }: Props & { ruta: string }) {
  const items = admin === null ? ITEMS : [...ITEMS, ADMIN];
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));

  if (variante === "inferior") {
    return (
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(({ href, texto, Icono }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={activo(href) ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                activo(href) ? "text-oro" : "text-niebla"
              }`}
            >
              {activo(href) && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-oro" />}
              <span className="relative">
                <Icono className="size-6" strokeWidth={1.75} aria-hidden />
                {href === "/admin" && !!admin && <Contador n={admin} />}
              </span>
              {texto}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-1">
      {items.map(({ href, texto, Icono }) => (
        <li key={href}>
          <Link
            href={href}
            aria-current={activo(href) ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 font-medium transition-colors ${
              activo(href)
                ? "bg-gradient-to-r from-oro/15 to-transparent text-pergamino"
                : "text-niebla hover:bg-white/[0.04] hover:text-pergamino"
            }`}
          >
            {activo(href) && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-oro" />}
            <Icono className={`size-5 ${activo(href) ? "text-oro" : ""}`} strokeWidth={1.75} aria-hidden />
            {texto}
            {href === "/admin" && !!admin && (
              <span className="ml-auto rounded-full bg-dire px-2 text-sm font-semibold text-white">{admin}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Contador({ n }: { n: number }) {
  return (
    <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-dire px-1 text-center text-[0.65rem] leading-4 font-bold text-white">
      {n > 9 ? "9+" : n}
      <span className="sr-only"> solicitudes pendientes</span>
    </span>
  );
}
