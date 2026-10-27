// Da (o quita) permisos de admin a un usuario.
// Uso: npx tsx --conditions=react-server scripts/hacer-admin.ts <usuario> [--quitar]
import { db } from "../src/lib/db";

const [usuario, flag] = process.argv.slice(2);
if (!usuario) {
  console.error("Uso: hacer-admin.ts <usuario> [--quitar]");
  process.exit(1);
}
const r = db().prepare("UPDATE usuarios SET es_admin = ? WHERE usuario = ?").run(flag === "--quitar" ? 0 : 1, usuario);
console.log(r.changes ? `Listo: ${usuario} ${flag === "--quitar" ? "ya no es" : "ahora es"} admin.` : `No existe el usuario ${usuario}.`);
