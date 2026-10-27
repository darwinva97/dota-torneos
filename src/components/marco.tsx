import Link from "next/link";
import { Suspense } from "react";
import { Bell, LogOut, Plus } from "lucide-react";
import { usuarioActual } from "@/lib/sesion";
import { solicitudesPendientes } from "@/lib/billetera";
import { accionSalir } from "@/app/acciones/cuenta";
import { accionAbrirRecarga } from "@/app/acciones/billetera";
import { Dinero } from "./ui";
import { EnlacesNav, NavActiva } from "./navegacion";

// Piezas del marco de la app (menú, cuenta) que dependen de la sesión. Todas
// van dentro de <Suspense> para que el resto de la página no las espere.

async function datosNav() {
  const u = await usuarioActual();
  if (!u?.es_admin) return { admin: null };
  const p = solicitudesPendientes();
  return { admin: p.retiros + p.recargas };
}

async function NavConDatos({ variante }: { variante: "lateral" | "inferior" }) {
  const { admin } = await datosNav();
  return (
    <Suspense fallback={<EnlacesNav variante={variante} admin={admin} ruta="" />}>
      <NavActiva variante={variante} admin={admin} />
    </Suspense>
  );
}

export function Navegacion({ variante }: { variante: "lateral" | "inferior" }) {
  return (
    <Suspense fallback={<EnlacesNav variante={variante} admin={null} ruta="" />}>
      <NavConDatos variante={variante} />
    </Suspense>
  );
}

// Degradados compartidos por el logo y las monedas. Van una sola vez en el
// layout y fuera de cualquier elemento oculto: si la definición quedara dentro
// de algo con display:none (la barra lateral en el celular), no se pintarían.
export function DegradadosSvg() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="logo-oro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8cb57" />
          <stop offset="1" stopColor="#c98b14" />
        </linearGradient>
        <radialGradient id="moneda" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.6" stopColor="#f2b632" />
          <stop offset="1" stopColor="#b3831d" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="El Pozo, inicio">
      <svg viewBox="0 0 32 32" aria-hidden className="size-8">
        <path d="M16 2 29 9v14l-13 7-13-7V9z" fill="#151d2e" stroke="url(#logo-oro)" strokeWidth="1.6" />
        <ellipse cx="16" cy="12.5" rx="7" ry="2.6" fill="none" stroke="url(#logo-oro)" strokeWidth="1.8" />
        <path d="M9 12.5v6.5c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-6.5" fill="none" stroke="url(#logo-oro)" strokeWidth="1.8" />
      </svg>
      <span className="cifra text-xl font-bold tracking-tight text-pergamino">El Pozo</span>
    </Link>
  );
}

export function Cuenta() {
  return (
    <Suspense fallback={<span className="block h-10 w-48" />}>
      <CuentaConDatos />
    </Suspense>
  );
}

async function CuentaConDatos() {
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
  const pendientes = u.es_admin ? solicitudesPendientes() : null;
  const totalPendientes = pendientes ? pendientes.retiros + pendientes.recargas : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Saldo + recarga rápida, como el contador de oro de la tienda. */}
      <div className="flex items-center overflow-hidden rounded-md border border-oro/30 bg-hondo/80">
        <Link href="/billetera" className="px-3 py-1.5 text-lg hover:bg-white/5" title="Tu saldo">
          <Dinero centimos={u.saldo} />
        </Link>
        <form action={accionAbrirRecarga}>
          <button
            className="flex h-full items-center border-l border-oro/30 bg-oro/10 px-2.5 py-2 text-oro hover:bg-oro/20"
            title="Recargar con Yape"
            aria-label="Recargar con Yape"
          >
            <Plus className="size-5" strokeWidth={2.25} aria-hidden />
          </button>
        </form>
      </div>
      {u.es_admin ? (
        <Link
          href="/admin"
          className="relative rounded-md p-2 text-niebla hover:bg-white/5 hover:text-pergamino"
          title={totalPendientes ? `${totalPendientes} solicitudes por atender` : "Sin solicitudes"}
          aria-label={`Solicitudes del admin: ${totalPendientes}`}
        >
          <Bell className="size-5" strokeWidth={1.75} aria-hidden />
          {totalPendientes > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-dire px-1 text-center text-[0.65rem] leading-4 font-bold text-white">
              {totalPendientes}
            </span>
          )}
        </Link>
      ) : null}
      <Link
        href="/perfil"
        className="flex items-center gap-2 rounded-md p-1.5 text-niebla hover:bg-white/5 hover:text-pergamino"
        title="Perfil"
      >
        <span className="grid size-8 place-items-center rounded-md bg-gradient-to-br from-losa-alta to-borde font-semibold text-pergamino">
          {u.usuario[0]?.toUpperCase()}
        </span>
        <span className="hidden md:inline">{u.usuario}</span>
      </Link>
      <form action={accionSalir} className="hidden sm:block">
        <button className="rounded-md p-2 text-niebla hover:bg-white/5 hover:text-pergamino" title="Salir" aria-label="Salir">
          <LogOut className="size-5" strokeWidth={1.75} aria-hidden />
        </button>
      </form>
    </div>
  );
}

