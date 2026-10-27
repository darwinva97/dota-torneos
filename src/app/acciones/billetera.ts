"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { exigirAdmin, exigirUsuario } from "@/lib/sesion";
import { aEstado, exigir, type Estado } from "@/lib/errores";
import { leerSoles } from "@/lib/dinero";
import { cancelarRetiro, pedirRetiro, resolverRetiro } from "@/lib/billetera";
import * as R from "@/lib/yape/recargas";

const num = (fd: FormData, k: string) => Number(fd.get(k));

export async function accionAbrirRecarga() {
  const u = await exigirUsuario();
  const id = R.abrirRecarga(u.id);
  redirect(`/billetera/recargar?r=${id}`);
}

export async function accionCancelarRecarga(fd: FormData) {
  const u = await exigirUsuario();
  R.cancelarRecarga(num(fd, "recarga_id"), u.id);
  redirect("/billetera");
}

export async function accionReclamar(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    R.reclamarPago(num(fd, "recarga_id"), u.id, num(fd, "pago_id"));
  } catch (e) {
    return aEstado(e);
  }
  return { ok: "Enviado al admin. Lo acreditará cuando revise tu captura." };
}

export async function accionRetiro(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    const monto = leerSoles(fd.get("monto"));
    exigir(monto, "Escribe cuánto quieres retirar.");
    pedirRetiro(u.id, monto, String(fd.get("destino") ?? ""));
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Solicitud enviada al admin. Te avisamos aquí cuando la pague." };
}

export async function accionCancelarRetiro(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  try {
    cancelarRetiro(num(fd, "retiro_id"), u.id);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Retiro cancelado. El monto volvió a tu saldo." };
}

// --- Admin ---

async function comoAdmin(fn: () => void, ok: string): Promise<Estado> {
  await exigirAdmin();
  try {
    fn();
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok };
}

export async function accionAprobarRecarga(_: Estado, fd: FormData) {
  return comoAdmin(() => R.acreditar(num(fd, "recarga_id"), num(fd, "pago_id")), "Recarga acreditada.");
}

export async function accionRechazarRecarga(_: Estado, fd: FormData) {
  return comoAdmin(() => R.rechazarRecarga(num(fd, "recarga_id"), String(fd.get("nota") ?? "")), "Recarga rechazada.");
}

export async function accionPagarRetiro(_: Estado, fd: FormData) {
  return comoAdmin(
    () => resolverRetiro(num(fd, "retiro_id"), { pagado: true, operacion: String(fd.get("operacion") ?? "") }),
    "Retiro marcado como pagado.",
  );
}

export async function accionRechazarRetiro(_: Estado, fd: FormData) {
  return comoAdmin(
    () => resolverRetiro(num(fd, "retiro_id"), { pagado: false, motivo: String(fd.get("motivo") ?? "") }),
    "Retiro rechazado. El monto volvió al saldo del usuario.",
  );
}

// Simula una notificación del observador. Solo existe con YAPE_SIMULADOR=1,
// mientras no esté conectada la API real.
export async function accionSimularPago(_: Estado, fd: FormData): Promise<Estado> {
  if (process.env.YAPE_SIMULADOR !== "1") return { error: "El simulador está apagado." };
  return comoAdmin(() => {
    const monto = leerSoles(fd.get("monto"));
    exigir(monto, "Escribe un monto.");
    R.ingresarPago({
      externoId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      monto,
      nombre: String(fd.get("nombre") ?? ""),
      recibido: Date.now(),
      fuente: "simulador",
    });
  }, "Pago simulado enviado.");
}
