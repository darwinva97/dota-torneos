"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { exigirAdmin, exigirUsuario } from "@/lib/sesion";
import { aEstado, exigir, type Estado } from "@/lib/errores";
import { leerSoles } from "@/lib/dinero";
import {
  ajustarSaldo,
  cambiarAdmin,
  cancelarRetiro,
  crearDeuda,
  multar,
  pedirRetiro,
  perdonarDeuda,
  resolverRetiro,
} from "@/lib/billetera";
import * as R from "@/lib/yape/recargas";

const num = (fd: FormData, k: string) => Number(fd.get(k));

export async function accionAbrirRecarga(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  let id: number;
  try {
    const monto = leerSoles(fd.get("monto"));
    exigir(monto, "Escribe cuánto vas a yapear, por ejemplo 10 o 7.50.");
    id = R.abrirRecarga(u.id, monto);
  } catch (e) {
    return aEstado(e);
  }
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
  return { ok: "Enviado al admin. Lo acreditará cuando lo revise." };
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

export async function accionCrearDeuda(_: Estado, fd: FormData): Promise<Estado> {
  const admin = await exigirAdmin();
  try {
    const monto = leerSoles(fd.get("monto"));
    exigir(monto, "Escribe el monto de la deuda.");
    crearDeuda({
      deudorId: num(fd, "deudor_id"),
      acreedorId: num(fd, "acreedor_id"),
      monto,
      motivo: String(fd.get("motivo") ?? ""),
      creadoPor: admin.id,
    });
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Deuda asignada. Si tenía saldo, ya se le retuvo." };
}

export async function accionPerdonarDeuda(_: Estado, fd: FormData) {
  return comoAdmin(() => perdonarDeuda(num(fd, "deuda_id")), "Deuda perdonada.");
}

// --- Gestión de usuarios (admin) ---

export async function accionAjustar(_: Estado, fd: FormData): Promise<Estado> {
  const admin = await exigirAdmin();
  try {
    const monto = leerSoles(fd.get("monto"));
    exigir(monto, "Escribe el monto, por ejemplo 10 o 2.50.");
    const signo = fd.get("sentido") === "descontar" ? -1 : 1;
    ajustarSaldo(num(fd, "usuario_id"), signo * monto, String(fd.get("motivo") ?? ""), admin.usuario);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Saldo actualizado." };
}

export async function accionMultar(_: Estado, fd: FormData): Promise<Estado> {
  const admin = await exigirAdmin();
  try {
    const monto = leerSoles(fd.get("monto"));
    exigir(monto, "Escribe el monto de la multa.");
    multar(num(fd, "usuario_id"), monto, String(fd.get("motivo") ?? ""), admin.id);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Multa puesta. Se le retuvo lo que tenía; el resto se cobra de lo próximo que le entre." };
}

export async function accionCambiarAdmin(_: Estado, fd: FormData): Promise<Estado> {
  const admin = await exigirAdmin();
  const hacer = fd.get("es_admin") === "1";
  try {
    cambiarAdmin(num(fd, "usuario_id"), hacer, admin.id);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: hacer ? "Ahora es admin." : "Ya no es admin." };
}

export async function accionAsignarPago(_: Estado, fd: FormData): Promise<Estado> {
  const admin = await exigirAdmin();
  try {
    R.asignarPago(num(fd, "pago_id"), num(fd, "usuario_id"), admin.usuario);
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Yape asignado y acreditado." };
}

export async function accionDescartarPago(_: Estado, fd: FormData): Promise<Estado> {
  await exigirAdmin();
  try {
    R.descartarPago(num(fd, "pago_id"));
  } catch (e) {
    return aEstado(e);
  }
  refresh();
  return { ok: "Yape descartado." };
}
