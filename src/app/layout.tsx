import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { usuarioActual } from "@/lib/sesion";
import { accionSalir } from "./acciones/cuenta";
import { Dinero } from "@/components/ui";
import { Navegacion } from "@/components/navegacion";
import "./globals.css";

const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600"] });
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "El Pozo", template: "%s | El Pozo" },
  description: "Torneos y apuestas de Dota 2 entre amigos, con recargas por Yape.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${barlow.variable} ${barlowCondensed.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-borde bg-noche/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
            <Link href="/" className="cifra flex items-center gap-2 text-2xl font-bold tracking-wide text-pergamino">
              <svg viewBox="0 0 24 24" aria-hidden className="size-6">
                <ellipse cx="12" cy="7" rx="9" ry="3.2" fill="none" stroke="#e8b54a" strokeWidth="1.8" />
                <path d="M3 7v8c0 1.8 4 3.2 9 3.2s9-1.4 9-3.2V7" fill="none" stroke="#e8b54a" strokeWidth="1.8" />
              </svg>
              El Pozo
            </Link>
            <Navegacion />
            <div className="ml-auto">
              <Suspense fallback={<span className="block h-9 w-40" />}>
                <Cuenta />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-10">{children}</main>
      </body>
    </html>
  );
}

async function Cuenta() {
  const u = await usuarioActual();
  if (!u) {
    return (
      <div className="flex gap-2">
        <Link href="/entrar" className="boton-sobrio py-1.5">
          Entrar
        </Link>
        <Link href="/registro" className="boton py-1.5">
          Crear cuenta
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <Link href="/billetera" className="text-xl hover:opacity-85" title="Tu saldo">
        <Dinero centimos={u.saldo} />
      </Link>
      <Link href="/perfil" className="text-niebla hover:text-pergamino">
        {u.usuario}
      </Link>
      {u.es_admin ? (
        <Link href="/admin" className="text-niebla hover:text-pergamino">
          Admin
        </Link>
      ) : null}
      <form action={accionSalir}>
        <button className="text-niebla hover:text-pergamino">Salir</button>
      </form>
    </div>
  );
}
