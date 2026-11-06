import Link from "next/link";
import { Smartphone, Timer, UserCheck, Wallet } from "lucide-react";
import { Copiar } from "@/components/copiar";
import { Formulario, Enviar } from "@/components/formulario";
import { accionAbrirRecarga } from "../../acciones/billetera";

// Antes de empezar: el turno dura 1 minuto y 15 segundos, así que el usuario se prepara
// primero, dice cuánto va a yapear y el reloj solo arranca cuando pulsa
// «Iniciar recarga».
export function Preparacion({
  nombreYape,
  numero,
  titular,
  enCola,
}: {
  nombreYape: string;
  numero: string;
  titular: string;
  enCola: number;
}) {
  const pasos = [
    {
      Icono: Smartphone,
      texto: (
        <>
          Abre Yape en tu celular y deja lista la pantalla de <strong className="text-pergamino">Yapear</strong>.
        </>
      ),
    },
    {
      Icono: UserCheck,
      texto: (
        <>
          Busca al pozo:{" "}
          {numero ? (
            <>
              <span className="cifra text-pergamino">{numero.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}</span>
              {titular && <> ({titular})</>} <Copiar texto={numero} etiqueta={`Copiar el número ${numero}`} />
            </>
          ) : (
            "pide el número al admin."
          )}
        </>
      ),
    },
    {
      Icono: Wallet,
      texto: (
        <>
          Escribe abajo cuánto vas a yapear: lo reconocemos por ese monto. Da igual desde qué cuenta yapees, aunque si
          es la tuya (<span className="text-pergamino">{nombreYape}</span>) mejor.
        </>
      ),
    },
    {
      Icono: Timer,
      texto: (
        <>
          Cuando pulses <strong className="text-pergamino">Iniciar recarga</strong> empieza tu turno de{" "}
          <strong className="text-pergamino">1 minuto y 15 segundos</strong>: yapea en cuanto aparezca la cuenta atrás. Si se te
          pasa el tiempo, tu próximo intento esperará 1 minuto.
        </>
      ),
    },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-5xl">Recargar con Yape</h1>
        <p className="mt-2 text-niebla">Prepárate antes de empezar: el turno es corto y solo una persona recarga a la vez.</p>
      </header>
      <ol className="panel hud space-y-4 p-6">
        {pasos.map(({ Icono, texto }, i) => (
          <li key={i} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-oro/10 text-oro">
              <Icono className="size-5" aria-hidden />
            </span>
            <p className="pt-1.5 text-niebla">{texto}</p>
          </li>
        ))}
      </ol>
      {enCola > 0 && (
        <p className="text-niebla">
          Ahora mismo {enCola === 1 ? "hay 1 persona" : `hay ${enCola} personas`} recargando o esperando. Entrarás en la
          cola y tu turno empezará cuando te toque.
        </p>
      )}
      <Formulario accion={accionAbrirRecarga} className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="etiqueta">Monto que vas a yapear</span>
          <span className="flex items-center rounded-md border border-borde bg-hondo focus-within:border-oro focus-within:shadow-[0_0_0_3px_rgb(242_182_50/0.15)]">
            <span className="cifra pl-3 text-xl text-niebla">S/</span>
            <input
              name="monto"
              required
              inputMode="decimal"
              placeholder="10"
              className="cifra w-36 bg-transparent px-2 py-3 text-2xl focus:outline-none"
            />
          </span>
        </label>
        <Enviar className="px-8 py-4 text-xl">Iniciar recarga</Enviar>
        <Link href="/billetera" className="pb-4 text-niebla underline underline-offset-4 hover:text-pergamino">
          Ahora no
        </Link>
      </Formulario>
    </div>
  );
}
