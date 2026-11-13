// Relève les actions alimentaires de la semaine et écrit deals.json.
// Lecture des pages en Node, tri confié à une IA :
//  - par défaut GitHub Models (gratuit, inclus dans GitHub, aucune clé : utilise GITHUB_TOKEN) ;
//  - l'API Claude si le secret ANTHROPIC_API_KEY existe.
// En cas de problème, le script s'arrête en erreur : deals.json n'est pas modifié et GitHub envoie un e-mail.
import fs from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
const GH = process.env.GITHUB_TOKEN;
const USE_CLAUDE = !!KEY;
const MODEL = USE_CLAUDE ? (process.env.CLAUDE_MODEL || "claude-sonnet-5-5") : (process.env.AI_MODEL || "openai/gpt-4.1-mini");
// GitHub Models gratuit limite la taille de chaque demande : on découpe les pages en morceaux
const CHUNK = USE_CLAUDE ? 90000 : 16000;
if (!KEY && !GH) { console.error("Ni GITHUB_TOKEN ni ANTHROPIC_API_KEY : impossible d'appeler une IA."); process.exit(1); }
console.log(`IA utilisée : ${USE_CLAUDE ? "API Claude" : "GitHub Models"} (${MODEL})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYS = "pates, boeuf, burger, poulet, pilons, porc, cabillaud, saumon, saumonfume, moules, sandre, fondue, lardons, jambon, schufeli, pdt (pommes de terre), tomates (fraîches), tomboite (tomates en boîte), poivrons, mais, chou, courge, poireau, pommes, fraisfromage, fromagetr (fromage en tranches)";

const SOURCES = [
  ["aktionis", "https://www.aktionis.ch/vendors/migros/futuredeals"],
  ["aktionis", "https://www.aktionis.ch/vendors/migros"],
  ["aktionis", "https://www.aktionis.ch/vendors/coop/futuredeals"],
  ["aktionis", "https://www.aktionis.ch/vendors/coop"],
  ["aktionis", "https://www.aktionis.ch/vendors/denner/futuredeals"],
  ["aktionis", "https://www.aktionis.ch/vendors/denner/futuredeals/2"],
  ["aktionis", "https://www.aktionis.ch/vendors/denner/futuredeals/3"],
  ["aktionis", "https://www.aktionis.ch/vendors/lidl/futuredeals"],
  ["aktionis", "https://www.aktionis.ch/vendors/lidl/futuredeals/2"],
  ["aktionis", "https://www.aktionis.ch/vendors/lidl"],
  ["rappn", "https://rappn.ch/en/offers/migros"],
  ["rappn", "https://rappn.ch/en/offers/coop"],
  ["rappn", "https://rappn.ch/en/offers/lidl"],
  ["officiel", "https://www.denner.ch/fr/actions"],
];

// Jeudi de la semaine d'actions (aujourd'hui si on est jeudi), heure suisse
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Zurich" }));
const thu = new Date(now); thu.setDate(now.getDate() + ((4 - now.getDay() + 7) % 7));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const wed = new Date(thu); wed.setDate(thu.getDate() + 6);
const THU = iso(thu), WED = iso(wed);

function htmlToText(html, keepLinks) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  if (keepLinks) t = t.replace(/<a[^>]+href="([^"]+)"[^>]*>/gi, (m, u) => ` [lien: ${u.startsWith("http") ? u : "https://www.denner.ch" + u}] `);
  t = t.replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/article)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
  return t.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

async function fetchText(url, keepLinks) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; MenuMalinBot/1.0)", "accept-language": "fr-CH,fr;q=0.9,de;q=0.8" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return htmlToText(await r.text(), keepLinks).slice(0, 90000);
}

async function ask(prompt) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = USE_CLAUDE
      ? await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
          headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }) })
      : await fetch("https://models.github.ai/inference/chat/completions", { method: "POST",
          headers: { authorization: `Bearer ${GH}`, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
    if (r.status === 429) { console.log("Limite atteinte, pause de 60 s…"); await sleep(60000); continue; }
    if (!r.ok) throw new Error(`IA ${r.status} : ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return USE_CLAUDE ? (j.content || []).map((c) => c.text || "").join("") : (j.choices?.[0]?.message?.content || "");
  }
  throw new Error("IA indisponible (limite de requêtes)");
}

async function extract(src, url, fullText) {
  const out = [];
  for (let i = 0; i < fullText.length; i += CHUNK) {
    const text = fullText.slice(Math.max(0, i - 300), i + CHUNK);
    out.push(...(await extractChunk(src, url, text)));
    if (!USE_CLAUDE) await sleep(4000);
  }
  return out;
}

async function extractChunk(src, url, text) {
  const prompt = `Voici le texte d'une page d'actions de supermarchés suisses (source : ${url}).
Garde UNIQUEMENT les actions alimentaires valables le jeudi ${THU} (la période doit couvrir ce jour) dont le produit correspond clairement à UNE de ces clés : ${KEYS}.
Ignore boissons, snacks, sucreries, plats préparés, produits panés, non-alimentaire, et toute action sans prix normal (« statt », « au lieu de », « was »).
Réponds UNIQUEMENT par un tableau JSON (sans texte autour), un objet par action :
{"s":"migros|coop|denner|lidl","k":"<clé>","p":"<nom du produit en français avec contenu ; ajoute une restriction régionale entre parenthèses si elle existe, sauf Tessin>","pr":<prix action CHF>,"rg":<prix normal CHF>,"per":100 ou 1000 UNIQUEMENT si le prix affiché est par 100 g ou par kg (sinon omets),"sz":<contenu total en grammes, ou nombre de pièces/tranches pour burger et fromagetr ; omets si per>,"est":true si tu as estimé sz,"ti":true si réservé au Tessin,"until":"JJ.MM","u":"<lien de la page de l'action si présent dans le texte sous la forme [lien: ...], sinon omets>"}
Un emballage de 250 g vendu 9.95 n'est PAS un prix au kg. Si aucune action ne correspond, réponds [].

TEXTE :
${text}`;
  const out = await ask(prompt);
  const m = out.match(/\[[\s\S]*\]/);
  let arr = [];
  try { arr = m ? JSON.parse(m[0]) : []; } catch { console.log("Réponse illisible ignorée pour un morceau de " + url); }
  return arr.map((d) => ({ ...d, src: [src] }));
}

const VALID_K = new Set(KEYS.split(",").map((s) => s.trim().split(" ")[0]));
const VALID_S = new Set(["migros", "coop", "denner", "lidl"]);
function clean(d) {
  if (!VALID_S.has(d.s) || !VALID_K.has(d.k)) return null;
  const pr = +d.pr, rg = +d.rg;
  if (!(pr > 0 && rg > pr && rg < 500)) return null;
  const o = { s: d.s, k: d.k, p: String(d.p || "").slice(0, 120), pr, rg };
  if (d.per === 100 || d.per === 1000) o.per = d.per; else if (+d.sz > 0) o.sz = +d.sz; else { o.sz = 500; o.est = true; }
  if (d.est && o.sz) o.est = true;
  if (d.ti) o.ti = true;
  if (/^\d{2}\.\d{2}$/.test(d.until || "")) o.until = d.until;
  if (typeof d.u === "string" && /^https:\/\/www\.denner\.ch\//.test(d.u)) o.u = d.u.split("?")[0];
  o.src = d.src;
  return o;
}

const all = [], read = [], failed = [];
for (const [src, url] of SOURCES) {
  try {
    const text = await fetchText(url, src === "officiel");
    if (text.length < 500) throw new Error("page vide");
    const deals = await extract(src, url, text);
    console.log(`${url} : ${deals.length} actions`);
    all.push(...deals); read.push(url);
  } catch (e) { console.log(`ÉCHEC ${url} : ${e.message}`); failed.push(url); }
}

// Fusion des doublons (même enseigne, même clé, mêmes prix)
const merged = new Map();
for (const d of all.map(clean).filter(Boolean)) {
  const key = `${d.s}|${d.k}|${d.pr}|${d.rg}`;
  const prev = merged.get(key);
  if (!prev) { merged.set(key, d); continue; }
  prev.src = [...new Set([...prev.src, ...d.src])];
  if (!prev.u && d.u) prev.u = d.u;
  if (d.p.length > prev.p.length) prev.p = d.p;
}
const deals = [...merged.values()];
const stores = ["migros", "coop", "denner", "lidl"];
const missing = stores.filter((s) => !deals.some((d) => d.s === s)).concat("aldi");
const untils = deals.map((d) => d.until).filter(Boolean);
const freq = untils.sort((a, b) => untils.filter((x) => x === b).length - untils.filter((x) => x === a).length)[0];
const to = freq ? `${thu.getFullYear()}-${freq.slice(3, 5)}-${freq.slice(0, 2)}` : WED;

console.log(`Total : ${deals.length} actions ; manquantes : ${missing.join(", ")} ; sources en échec : ${failed.length}`);
if (deals.length < 15) { console.error("Moins de 15 actions : deals.json n'est pas modifié."); process.exit(1); }

const json = { meta: { from: THU, to, collected: iso(now), sources: read, missing }, deals };
fs.writeFileSync("deals.json", JSON.stringify(json, null, 1));
for (const s of stores) console.log(`${s} : ${deals.filter((d) => d.s === s).length} (vérifiées sur 2 sources : ${deals.filter((d) => d.s === s && d.src.length > 1).length})`);
