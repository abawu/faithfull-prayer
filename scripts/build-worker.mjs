import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const page = readFileSync("dist/index.html", "utf8");
mkdirSync("dist/server", { recursive: true });

const worker = `const PAGE = ${JSON.stringify(page)};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const identity = (request) => ({ id: request.headers.get("oai-authenticated-user-id"), email: request.headers.get("oai-authenticated-user-email") || "" });
const requireIdentity = (request) => { const user = identity(request); return user.id ? user : null; };
const ensureSchema = async (db) => db.prepare("CREATE TABLE IF NOT EXISTS prayer_journals (user_id TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL, updated_at TEXT NOT NULL)").run();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/me") {
      const user = identity(request);
      return user.id ? json(user) : json({ error: "sign_in_required" }, 401);
    }
    if (url.pathname === "/api/prayers") {
      const user = requireIdentity(request);
      if (!user) return json({ error: "sign_in_required" }, 401);
      if (!env.DB) return json({ error: "cloud_storage_unavailable" }, 503);
      await ensureSchema(env.DB);
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT payload FROM prayer_journals WHERE user_id = ?1").bind(user.id).first();
        return json({ records: row?.payload ? JSON.parse(row.payload) : {} });
      }
      if (request.method === "PUT") {
        const body = await request.json();
        const records = body?.records && typeof body.records === "object" ? body.records : {};
        const payload = JSON.stringify(records);
        if (payload.length > 2_000_000) return json({ error: "journal_too_large" }, 413);
        await env.DB.prepare("INSERT INTO prayer_journals (user_id, email, payload, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, payload = excluded.payload, updated_at = excluded.updated_at").bind(user.id, user.email, payload, new Date().toISOString()).run();
        return json({ ok: true });
      }
      return json({ error: "method_not_allowed" }, 405);
    }
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  },
};
`;

writeFileSync("dist/server/index.js", worker);
