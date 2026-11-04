import "server-only";
import crypto from "node:crypto";
import { db, transaccion } from "./db";
import { ErrorUsuario, exigir } from "./errores";
import { finalizarPorTabla, marcarEnCurso, prepararInicio, torneo, type Torneo } from "./torneos";
import { leerRitmo } from "./formatos";

// Integración con Lichess (https://lichess.org/api). Lichess admite OAuth con
// PKCE sin registrar la aplicación, así que cada jugador conecta su cuenta y
// nos da permiso «tournament:write» para inscribirlo en los torneos.
//
//  - Quien organiza crea el torneo en Lichess con su propia cuenta (Arena o
//    Suizo), privado con contraseña para que solo entren los de El Pozo.
//  - Al crearlo inscribimos a cada jugador con su token.
//  - Cada minuto (y con el botón «Sincronizar») leemos el estado; cuando
//    termina, tomamos la clasificación de Lichess y repartimos el premio.

export const LICHESS = process.env.LICHESS_URL ?? "https://lichess.org";
export const CLIENT_ID = "apuestas.bezenti.com";
const ALCANCE = "tournament:write";

// --- Tokens cifrados en la base (AES-256-GCM con LICHESS_CLAVE) ---

function clave() {
  const hex = process.env.LICHESS_CLAVE;
  if (!hex || hex.length !== 64) throw new Error("Falta LICHESS_CLAVE (64 caracteres hex) en el entorno.");
  return Buffer.from(hex, "hex");
}

function cifrar(texto: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64url")).join(".");
}

function descifrar(guardado: string) {
  const [iv, tag, datos] = guardado.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
}

function tokenDe(usuarioId: number) {
  const f = db().prepare("SELECT lichess_token FROM usuarios WHERE id = ?").get(usuarioId) as
    | { lichess_token: string }
    | undefined;
  return f?.lichess_token ? descifrar(f.lichess_token) : null;
}

// --- OAuth con PKCE ---

export function empezarOAuth(redirectUri: string) {
  const verificador = crypto.randomBytes(32).toString("base64url");
  const estado = crypto.randomBytes(16).toString("base64url");
  const reto = crypto.createHash("sha256").update(verificador).digest("base64url");
  const url = new URL("/oauth", LICHESS);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: reto,
    scope: ALCANCE,
    state: estado,
  }).toString();
  return { url: url.toString(), verificador, estado };
}

export async function terminarOAuth(usuarioId: number, codigo: string, verificador: string, redirectUri: string) {
  const res = await fetch(new URL("/api/token", LICHESS), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: codigo,
      code_verifier: verificador,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new ErrorUsuario("Lichess no aceptó la autorización. Vuelve a intentarlo.");
  const { access_token: token } = (await res.json()) as { access_token: string };
  const cuenta = (await api(token, "GET", "/api/account")) as { username: string };
  // Una cuenta de Lichess no puede estar conectada a dos usuarios: los
  // premios se reparten por nombre de Lichess.
  const otra = db()
    .prepare("SELECT 1 FROM usuarios WHERE lower(lichess_usuario) = lower(?) AND id != ?")
    .get(cuenta.username, usuarioId);
  if (otra) throw new ErrorUsuario(`La cuenta ${cuenta.username} de Lichess ya está conectada a otro usuario.`);
  db()
    .prepare("UPDATE usuarios SET lichess_usuario = ?, lichess_token = ? WHERE id = ?")
    .run(cuenta.username, cifrar(token), usuarioId);
  return cuenta.username;
}

export async function desconectar(usuarioId: number) {
  const token = tokenDe(usuarioId);
  if (token) await fetch(new URL("/api/token", LICHESS), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  db().prepare("UPDATE usuarios SET lichess_usuario = '', lichess_token = '' WHERE id = ?").run(usuarioId);
}

// --- Llamadas a la API ---

async function api(token: string | null, metodo: "GET" | "POST", ruta: string, form?: Record<string, string | number | boolean>) {
  const res = await fetch(new URL(ruta, LICHESS), {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      Accept: "application/json",
    },
    body: form ? new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const texto = await res.text();
  if (!res.ok) {
    let msg = texto.slice(0, 300);
    try {
      const j = JSON.parse(texto) as { error?: unknown };
      if (j.error) msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
    } catch {}
    throw new ErrorUsuario(`Lichess respondió: ${msg}`);
  }
  return texto.trim().startsWith("{") || texto.trim().startsWith("[") ? JSON.parse(texto) : texto;
}

// Resultados en ndjson: un jugador por línea, ordenados por puesto.
async function resultados(t: Torneo) {
  const ruta = t.formato === "lichess_arena" ? `/api/tournament/${t.lichess_id}/results` : `/api/swiss/${t.lichess_id}/results`;
  const res = await fetch(new URL(ruta, LICHESS), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new ErrorUsuario(`No se pudieron leer los resultados de Lichess (${res.status}).`);
  return (await res.text())
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { rank: number; username: string; score?: number; points?: number })
    .sort((a, b) => a.rank - b.rank);
}

export function urlTorneo(t: Pick<Torneo, "formato" | "lichess_id">) {
  if (!t.lichess_id) return null;
  return new URL(`/${t.formato === "lichess_arena" ? "tournament" : "swiss"}/${t.lichess_id}`, LICHESS).toString();
}

// --- Torneos ---

export async function iniciarEnLichess(torneoId: number, usuarioId: number, esAdmin: boolean) {
  const t = prepararInicio(torneoId, usuarioId, esAdmin);
  const token = tokenDe(t.organizador_id);
  exigir(token, "Quien organiza tiene que conectar su cuenta de Lichess (en Perfil) para crear el torneo allí.");
  const r = leerRitmo(t.ritmo)!;
  const contrasena = crypto.randomBytes(6).toString("base64url");
  const nombre = t.nombre.slice(0, 30).padEnd(2, ".");
  const descripcion = "Torneo de El Pozo (apuestas.bezenti.com). Solo para inscritos allí.";
  const creado = (
    t.formato === "lichess_arena"
      ? await api(token, "POST", "/api/tournament", {
          name: nombre,
          clockTime: r.minutos,
          clockIncrement: r.incremento,
          minutes: t.duracion,
          waitMinutes: 5,
          rated: false,
          password: contrasena,
          description: descripcion,
        })
      : await api(token, "POST", `/api/swiss/new/${t.lichess_equipo}`, {
          name: nombre,
          "clock.limit": Math.round(r.minutos * 60),
          "clock.increment": r.incremento,
          nbRounds: Math.max(3, t.rondas || 3),
          startsAt: Date.now() + 5 * 60_000,
          rated: false,
          password: contrasena,
          description: descripcion,
        })
  ) as { id: string };
  transaccion(() => {
    marcarEnCurso(torneo(torneoId)!);
    db()
      .prepare("UPDATE torneos SET lichess_id = ?, lichess_clave = ? WHERE id = ?")
      .run(creado.id, contrasena, torneoId);
  });
  return inscribirTodos(torneoId);
}

// Inscribe en Lichess a quien aún no lo está. Devuelve a quiénes no se pudo.
export async function inscribirTodos(torneoId: number) {
  const t = torneo(torneoId)!;
  const pendientes = db()
    .prepare(
      `SELECT i.usuario_id, u.usuario FROM integrantes i JOIN usuarios u ON u.id = i.usuario_id
       WHERE i.torneo_id = ? AND i.lichess_inscrito = 0`,
    )
    .all(torneoId) as { usuario_id: number; usuario: string }[];
  const fallos: string[] = [];
  for (const p of pendientes) {
    try {
      await inscribir(t, p.usuario_id);
    } catch (e) {
      fallos.push(`${p.usuario}: ${(e as Error).message}`);
    }
  }
  return fallos;
}

export async function inscribir(t: Torneo, usuarioId: number) {
  const token = tokenDe(usuarioId);
  exigir(token, "Conecta tu cuenta de Lichess en Perfil para que te inscribamos.");
  const ruta = t.formato === "lichess_arena" ? `/api/tournament/${t.lichess_id}/join` : `/api/swiss/${t.lichess_id}/join`;
  await api(token, "POST", ruta, { password: t.lichess_clave });
  db()
    .prepare("UPDATE integrantes SET lichess_inscrito = 1 WHERE torneo_id = ? AND usuario_id = ?")
    .run(t.id, usuarioId);
}

export type PosicionLichess = { puesto: number; usuario: string; puntos: number; equipo: number | null };

// Clasificación actual (o final) con cada jugador de Lichess emparejado con su
// inscripción en El Pozo. Se guarda 20 s en memoria para no castigar a Lichess.
const cache = new Map<number, { hasta: number; datos: PosicionLichess[] }>();
export async function posiciones(t: Torneo): Promise<PosicionLichess[]> {
  const c = cache.get(t.id);
  if (c && c.hasta > Date.now()) return c.datos;
  const inscritos = db()
    .prepare(
      `SELECT lower(u.lichess_usuario) AS lichess, i.equipo_id FROM integrantes i
       JOIN usuarios u ON u.id = i.usuario_id WHERE i.torneo_id = ?`,
    )
    .all(t.id) as { lichess: string; equipo_id: number }[];
  const datos = (await resultados(t)).map((r) => ({
    puesto: r.rank,
    usuario: r.username,
    puntos: r.score ?? r.points ?? 0,
    equipo: inscritos.find((i) => i.lichess === r.username.toLowerCase())?.equipo_id ?? null,
  }));
  cache.set(t.id, { hasta: Date.now() + 20_000, datos });
  return datos;
}

// Si el torneo terminó en Lichess, reparte el premio por su clasificación.
// Los inscritos que no jugaron quedan detrás. Devuelve si se finalizó.
export async function sincronizar(torneoId: number) {
  const t = torneo(torneoId);
  if (!t || t.estado !== "en_curso" || !t.lichess_id) return false;
  const info = (await api(
    null,
    "GET",
    t.formato === "lichess_arena" ? `/api/tournament/${t.lichess_id}` : `/api/swiss/${t.lichess_id}`,
  )) as { isFinished?: boolean; status?: string };
  db().prepare("UPDATE torneos SET lichess_sync = ? WHERE id = ?").run(Date.now(), torneoId);
  const terminado = t.formato === "lichess_arena" ? info.isFinished === true : info.status === "finished";
  if (!terminado) return false;
  cache.delete(t.id);
  const tabla = await posiciones(t);
  const vistos = new Set<number>();
  const orden = tabla
    .filter((p) => p.equipo !== null && !vistos.has(p.equipo) && vistos.add(p.equipo))
    .map((p) => ({ equipo: p.equipo!, clave: String(p.puesto) }));
  const ausentes = db().prepare("SELECT id FROM equipos WHERE torneo_id = ?").all(t.id) as { id: number }[];
  for (const a of ausentes) if (!vistos.has(a.id)) orden.push({ equipo: a.id, clave: "ausente" });
  transaccion(() => {
    const actual = torneo(torneoId)!;
    if (actual.estado === "en_curso") finalizarPorTabla(actual, orden);
  });
  return true;
}

// Cada minuto, revisa los torneos de Lichess en curso.
const g = globalThis as unknown as { __pozoLichess?: NodeJS.Timeout };
export function arrancarSincronizacion() {
  g.__pozoLichess ??= setInterval(async () => {
    const enCurso = db()
      .prepare("SELECT id FROM torneos WHERE estado = 'en_curso' AND lichess_id != ''")
      .all() as { id: number }[];
    for (const { id } of enCurso) {
      try {
        await sincronizar(id);
      } catch (e) {
        console.error(`[lichess] no se pudo sincronizar el torneo ${id}:`, (e as Error).message);
      }
    }
  }, 60_000);
}
