// API de la liste de courses et des favoris partagés d'un foyer.
// Stockage : Netlify Blobs (inclus dans Netlify, rien à configurer).
import { getStore } from "@netlify/blobs";

const COLLS = ["liste", "favoris"];
const ok = (body, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const foyer = (url.searchParams.get("f") || "").toLowerCase();
  if (!/^[a-z0-9]{6,40}$/.test(foyer)) return ok({ error: "code foyer invalide" }, 400);
  const store = getStore({ name: "menu-malin", consistency: "strong" });

  if (req.method === "GET") {
    const out = {};
    for (const c of COLLS) {
      const { blobs } = await store.list({ prefix: `${foyer}/${c}/` });
      const vals = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
      out[c] = blobs
        .map((b, i) => (vals[i] ? { id: b.key.split("/").pop(), ...vals[i] } : null))
        .filter(Boolean);
    }
    return ok(out);
  }

  if (req.method === "POST") {
    const raw = await req.text();
    if (raw.length > 8000) return ok({ error: "trop volumineux" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return ok({ error: "JSON invalide" }, 400); }
    const { op, coll, id, data } = body || {};
    if (!COLLS.includes(coll) || !/^[A-Za-z0-9_-]{1,60}$/.test(id || "")) return ok({ error: "requête invalide" }, 400);
    const { blobs } = await store.list({ prefix: `${foyer}/${coll}/` });
    const key = `${foyer}/${coll}/${id}`;
    if (op === "delete") {
      await store.delete(key);
    } else if (op === "set" || op === "update") {
      if (!data || typeof data !== "object") return ok({ error: "données manquantes" }, 400);
      if (op === "set" && blobs.length >= 300 && !blobs.some((b) => b.key === key)) return ok({ error: "liste pleine" }, 413);
      const cur = op === "update" ? (await store.get(key, { type: "json" })) || {} : {};
      await store.setJSON(key, { ...cur, ...data });
    } else {
      return ok({ error: "opération inconnue" }, 400);
    }
    return ok({ ok: true });
  }
  return ok({ error: "méthode non autorisée" }, 405);
};

export const config = { path: "/api/liste" };
