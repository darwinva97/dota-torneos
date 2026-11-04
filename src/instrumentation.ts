export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { arrancarSondeo } = await import("./lib/yape/proveedor");
    arrancarSondeo();
    const { arrancarRelojCola } = await import("./lib/yape/recargas");
    arrancarRelojCola();
  }
}
