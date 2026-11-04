import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { exigirUsuario } from "@/lib/sesion";
import { pagosLibresDeVentana, recarga, vistaRecarga } from "@/lib/yape/recargas";
import { Cargando } from "@/components/ui";
import { Escucha } from "./escucha";

export const metadata: Metadata = { title: "Recargar con Yape" };

export default function Recargar({ searchParams }: PageProps<"/billetera/recargar">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/billetera/recargar">["searchParams"] }) {
  const u = await exigirUsuario();
  const { r } = await searchParams;
  const rec = recarga(Number(r));
  if (!rec || rec.usuario_id !== u.id) redirect("/billetera");

  return (
    <Escucha
      recargaId={rec.id}
      inicial={vistaRecarga(rec.id)!}
      pagosIniciales={pagosLibresDeVentana(rec).map((p) => ({ id: p.id, monto: p.monto, nombre: p.nombre, recibido: p.recibido }))}
      nombreYape={u.nombre_yape}
      numero={process.env.YAPE_NUMERO ?? ""}
      titular={process.env.YAPE_TITULAR ?? ""}
    />
  );
}
