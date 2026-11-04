// Lichess simulado para pruebas: imita las rutas que usa src/lib/lichess.ts con
// las formas de respuesta de la especificación oficial (lichess-org/api).
// Uso: npx tsx scripts/lichess-simulado.ts <puerto>
import http from "node:http";

export function crearLichessSimulado() {
  const estado = {
    torneos: new Map<string, { tipo: "arena" | "swiss"; clave: string; inscritos: string[]; terminado: boolean; creadoPor: string; form: Record<string, string> }>(),
    tokens: new Map<string, string>(), // token → usuario
    revocados: [] as string[],
  };
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    let cuerpo = "";
    for await (const c of req) cuerpo += c;
    const form = Object.fromEntries(new URLSearchParams(cuerpo));
    const usuario = estado.tokens.get((req.headers.authorization ?? "").replace("Bearer ", ""));
    const json = (s: number, d: unknown) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
    const p = url.pathname;
    // Ayudas para las pruebas de navegador.
    if (p === "/_estado") return json(200, [...estado.torneos].map(([id, t]) => ({ id, tipo: t.tipo, inscritos: t.inscritos, terminado: t.terminado })));
    if (p === "/_terminar") { for (const t of estado.torneos.values()) t.terminado = true; return json(200, { ok: true }); }
    // OAuth: aprueba al momento y vuelve con code=<usuario>.
    if (p === "/oauth" && !url.searchParams.get("login")) {
      // Como el Lichess real: primero hay que iniciar sesión y aprobar.
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      const ocultos = [...url.searchParams].map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`).join("");
      return res.end(`<form method="get" action="/oauth">${ocultos}<input name="login" placeholder="usuario"><button>Autorizar</button></form>`);
    }
    if (p === "/oauth") {
      const vuelta = new URL(url.searchParams.get("redirect_uri")!);
      vuelta.searchParams.set("code", url.searchParams.get("login") ?? "jugador");
      vuelta.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: vuelta.toString() }); return res.end();
    }
    if (p === "/api/token" && req.method === "POST") {
      if (!form.code_verifier) return json(400, { error: "invalid_grant" });
      const token = `tok-${form.code}-${Math.random().toString(36).slice(2)}`;
      estado.tokens.set(token, form.code);
      return json(200, { token_type: "Bearer", access_token: token, expires_in: 31536000 });
    }
    if (p === "/api/token" && req.method === "DELETE") { estado.revocados.push(usuario ?? ""); res.writeHead(204); return res.end(); }
    if (p === "/api/account") return usuario ? json(200, { id: usuario.toLowerCase(), username: usuario }) : json(401, { error: "No such token" });
    if (p === "/api/tournament" && req.method === "POST") {
      if (!usuario) return json(401, { error: "No such token" });
      const id = `arena${estado.torneos.size + 1}`;
      estado.torneos.set(id, { tipo: "arena", clave: form.password, inscritos: [], terminado: false, creadoPor: usuario, form });
      return json(200, { id, fullName: `${form.name} Arena` });
    }
    let m = /^\/api\/swiss\/new\/([\w-]+)$/.exec(p);
    if (m && req.method === "POST") {
      if (m[1] !== "mi-equipo") return json(400, { error: { teamId: ["No eres líder de ese equipo"] } });
      const id = `swiss${estado.torneos.size + 1}`;
      estado.torneos.set(id, { tipo: "swiss", clave: form.password, inscritos: [], terminado: false, creadoPor: usuario!, form });
      return json(200, { id });
    }
    m = /^\/api\/(tournament|swiss)\/(\w+)\/join$/.exec(p);
    if (m) {
      const t = estado.torneos.get(m[2]);
      if (!t || !usuario) return json(400, { error: "No encontrado" });
      if (form.password !== t.clave) return json(400, { error: "Wrong entry code" });
      if (!t.inscritos.includes(usuario)) t.inscritos.push(usuario);
      return json(200, { ok: true });
    }
    m = /^\/api\/(tournament|swiss)\/(\w+)\/results$/.exec(p);
    if (m) {
      const t = estado.torneos.get(m[2])!;
      // Clasificación: en orden de inscripción invertido, más un desconocido.
      const filas = [...t.inscritos].reverse().concat("ExtrañoGM").map((u, i) => ({ rank: i + 1, username: u, rating: 1500, ...(t.tipo === "arena" ? { score: 20 - i, performance: 1600 } : { points: 3 - i * 0.5, tieBreak: 1 }) }));
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      return res.end(filas.map((f) => JSON.stringify(f)).join("\n") + "\n");
    }
    m = /^\/api\/(tournament|swiss)\/(\w+)$/.exec(p);
    if (m) {
      const t = estado.torneos.get(m[2]);
      if (!t) return json(404, { error: "Not found" });
      return json(200, t.tipo === "arena" ? { id: m[2], isFinished: t.terminado, nbPlayers: t.inscritos.length } : { id: m[2], status: t.terminado ? "finished" : "started" });
    }
    json(404, { error: "Not found" });
  });
  return { servidor, estado };
}

if (process.argv[2]) {
  const { servidor } = crearLichessSimulado();
  servidor.listen(Number(process.argv[2]), "127.0.0.1", () => console.log(`Lichess simulado en :${process.argv[2]}`));
}
