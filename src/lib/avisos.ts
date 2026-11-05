import "server-only";
import { db } from "./db";

// Avisos dentro de la página: aparecen en la campana de cada jugador.

export type Aviso = { id: number; texto: string; enlace: string; leido: number; creado: string };

export function avisar(usuarioId: number, texto: string, enlace = "") {
  db().prepare("INSERT INTO avisos (usuario_id, texto, enlace) VALUES (?, ?, ?)").run(usuarioId, texto, enlace);
}

export function avisosDe(usuarioId: number, limite = 50) {
  return db()
    .prepare("SELECT id, texto, enlace, leido, creado FROM avisos WHERE usuario_id = ? ORDER BY id DESC LIMIT ?")
    .all(usuarioId, limite) as Aviso[];
}

export function avisosSinLeer(usuarioId: number) {
  return (db().prepare("SELECT COUNT(*) AS n FROM avisos WHERE usuario_id = ? AND leido = 0").get(usuarioId) as { n: number }).n;
}

export function marcarLeidos(usuarioId: number) {
  db().prepare("UPDATE avisos SET leido = 1 WHERE usuario_id = ? AND leido = 0").run(usuarioId);
}
