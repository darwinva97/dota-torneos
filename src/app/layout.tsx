import type { Metadata, Viewport } from "next";
import { Barlow, Chakra_Petch } from "next/font/google";
import { Cuenta, DegradadosSvg, Logo, Navegacion } from "@/components/marco";
import { AvisoDeuda } from "@/components/deudas";
import "./globals.css";

const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600"] });
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "El Pozo", template: "%s | El Pozo" },
  description: "Torneos y apuestas de Dota 2 entre amigos, con recargas por Yape.",
};

export const viewport: Viewport = { themeColor: "#0e1422" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${barlow.variable} ${chakra.variable} h-full`}>
      <body className="min-h-full lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <DegradadosSvg />
        {/* Escritorio: barra lateral fija. */}
        <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-white/[0.06] bg-hondo/70 px-4 py-5 backdrop-blur lg:flex">
          <div className="px-2">
            <Logo />
          </div>
          <nav aria-label="Principal">
            <Navegacion variante="lateral" />
          </nav>
          <p className="mt-auto px-3 text-xs text-niebla/70">Dota 2 entre amigos. Juega con lo que puedas perder.</p>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-noche/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
              <div className="lg:hidden">
                <Logo />
              </div>
              <div className="ml-auto">
                <Cuenta />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-28 sm:px-6 lg:pb-12">
            <AvisoDeuda />
            {children}
          </main>
        </div>

        {/* Celular: pestañas abajo, al alcance del pulgar. */}
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-hondo/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <Navegacion variante="inferior" />
        </nav>
      </body>
    </html>
  );
}
