// Edge Function: liest eine Fahrzeuganzeige (Link oder PDF), lässt Claude
// die Daten extrahieren und das Angebot bewerten, ermittelt den Standort
// und speichert alles in der Tabelle `cars`.
//
// Aufruf (mit Login-Token):
//   POST { url?: string, pdf_path?: string, image_path?: string }  -> neues Fahrzeug
//   POST { id: string }                                           -> erneut analysieren
//
// Die eigentliche Analyse läuft im Hintergrund (EdgeRuntime.waitUntil);
// die App bekommt sofort die ID zurück und sieht den Fortschritt per Realtime.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
// KI-Zugang über OpenRouter (OpenAI-kompatible API). Modell per Secret OPENROUTER_MODEL änderbar.
const DEFAULT_MODEL = "anthropic/claude-opus-5.5";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

class UserFacingError extends Error {}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Nicht angemeldet" }, 401);
  const userId = userData.user.id;

  let body: { id?: string; url?: string; pdf_path?: string; image_path?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültige Anfrage" }, 400);
  }

  let carId: string;

  if (body.id) {
    const { data: car, error } = await admin
      .from("cars").select("id, user_id").eq("id", body.id).single();
    if (error || !car || car.user_id !== userId) return json({ error: "Nicht gefunden" }, 404);
    await admin.from("cars").update({ status: "processing", error: null }).eq("id", car.id);
    carId = car.id;
  } else {
    const url = body.url?.trim() || null;
    const pdfPath = body.pdf_path || null;
    if (!url && !pdfPath) return json({ error: "Link oder PDF fehlt" }, 400);
    if (pdfPath && !pdfPath.startsWith(`${userId}/`)) return json({ error: "Ungültiger Pfad" }, 400);
    if (url && !/^https?:\/\//i.test(url)) return json({ error: "Ungültiger Link" }, 400);

    let imageUrl: string | null = null;
    if (body.image_path && body.image_path.startsWith(`${userId}/`)) {
      imageUrl = admin.storage.from("car-images").getPublicUrl(body.image_path).data.publicUrl;
    }

    const { data: car, error } = await admin.from("cars").insert({
      user_id: userId,
      status: "processing",
      url,
      pdf_path: pdfPath,
      image_url: imageUrl,
      source: detectSource(url),
      title: url ? "Anzeige wird gelesen …" : "PDF wird gelesen …",
    }).select("id").single();
    if (error || !car) return json({ error: error?.message ?? "Speichern fehlgeschlagen" }, 500);
    carId = car.id;
  }

  EdgeRuntime.waitUntil(
    processCar(admin, carId, userId).catch(async (e) => {
      console.error("analyze failed", e);
      const msg = e instanceof UserFacingError
        ? e.message
        : `Analyse fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
      await admin.from("cars").update({ status: "error", error: msg }).eq("id", carId);
    }),
  );

  return json({ id: carId });
});

function detectSource(url: string | null): string | null {
  if (!url) return "pdf";
  if (/mobile\.de/i.test(url)) return "mobile.de";
  if (/autoscout24\./i.test(url)) return "autoscout24";
  return "sonstige";
}

// ---------------------------------------------------------------------------

async function processCar(admin: SupabaseClient, carId: string, userId: string) {
  const { data: car, error } = await admin.from("cars").select("*").eq("id", carId).single();
  if (error || !car) throw new Error("Fahrzeug nicht gefunden");

  // 1) Quelle einlesen ------------------------------------------------------
  const content: ContentPart[] = [];
  let structured: Record<string, unknown> | null = null;
  let imageCandidates: string[] = [];
  let coords: { lat: number; lng: number } | null = null;

  if (car.pdf_path) {
    const { data: file, error: dlErr } = await admin.storage.from("listings").download(car.pdf_path);
    if (dlErr || !file) throw new UserFacingError("PDF konnte nicht geladen werden.");
    const b64 = base64(new Uint8Array(await file.arrayBuffer()));
    content.push({
      type: "file",
      file: { filename: "anzeige.pdf", file_data: `data:application/pdf;base64,${b64}` },
    });
    content.push({
      type: "text",
      text: `Die Anzeige liegt als PDF bei.${car.url ? ` Link zur Anzeige: ${car.url}` : ""}`,
    });
  } else if (car.url) {
    const page = await fetchListing(car.url);
    structured = page.structured;
    imageCandidates = page.images;
    coords = page.coords;
    content.push({
      type: "text",
      text: `Link zur Anzeige: ${car.url}\n\nInhalt der Anzeige (${page.kind}):\n\n${page.text}`,
    });
  } else {
    throw new UserFacingError("Weder Link noch PDF vorhanden.");
  }

  content.push({ type: "text", text: TASK_PROMPT });

  // 2) Claude: Daten extrahieren + bewerten -------------------------------
  const result = await askClaude(content);
  const v = result.vehicle;

  // 3) Bild ----------------------------------------------------------------
  let imageUrl: string | null = car.image_url;
  if (!imageUrl && imageCandidates.length) {
    imageUrl = await storeImage(admin, userId, carId, imageCandidates[0]) ?? imageCandidates[0];
  }

  // 4) Standort ------------------------------------------------------------
  if (!coords) coords = await geocode(v.zip, v.city, v.street, v.country_code);

  // 5) Speichern -----------------------------------------------------------
  const { error: upErr } = await admin.from("cars").update({
    status: "done",
    error: null,
    title: v.title,
    make: v.make,
    model: v.model,
    price_eur: v.price_eur,
    mileage_km: v.mileage_km,
    first_registration: v.first_registration,
    power_ps: v.power_ps,
    fuel: v.fuel,
    transmission: v.transmission,
    zip: v.zip,
    city: v.city,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    image_url: imageUrl,
    vehicle: v,
    evaluation: result.evaluation,
    raw: structured ? { images: imageCandidates.slice(0, 30) } : null,
  }).eq("id", carId);
  if (upErr) throw upErr;
}

// ---------------------------------------------------------------------------
// Anzeige per Link abrufen

type FetchedListing = {
  kind: string;
  text: string;
  structured: Record<string, unknown> | null;
  images: string[];
  coords: { lat: number; lng: number } | null;
};

async function fetchListing(url: string): Promise<FetchedListing> {
  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  } catch {
    throw new UserFacingError(
      "Die Anzeige konnte nicht abgerufen werden. Bitte die Anzeige als PDF speichern und hochladen.",
    );
  }
  if (!res.ok) {
    throw new UserFacingError(
      `Das Portal hat den Abruf blockiert (HTTP ${res.status}). ` +
        "Bitte die Anzeige im Browser als PDF speichern (Drucken → Als PDF speichern) und hochladen.",
    );
  }
  const html = await res.text();

  // autoscout24: komplette Anzeige steckt als JSON in __NEXT_DATA__
  const next = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (next) {
    try {
      const data = JSON.parse(next[1]);
      const ld = data?.props?.pageProps?.listingDetails;
      if (ld && ld.vehicle) {
        const pruned = {
          title: ld.title,
          description: stripHtml(ld.description ?? ""),
          prices: ld.prices,
          price: ld.price,
          vehicle: ld.vehicle,
          location: ld.location,
          seller: ld.seller
            ? { type: ld.seller.type, isDealer: ld.seller.isDealer, companyName: ld.seller.companyName }
            : null,
          ratings: ld.ratings,
          warranty: ld.warranty,
          warrantyExists: ld.warrantyExists,
          seals: ld.seals,
          vehicleReport: ld.vehicleReport,
          availability: ld.availability,
          createdTimestamp: ld.createdTimestampWithOffset,
        };
        const lat = Number(ld.location?.latitude);
        const lng = Number(ld.location?.longitude);
        return {
          kind: "strukturierte Daten von autoscout24, JSON",
          text: JSON.stringify(pruned).slice(0, 120_000),
          structured: pruned,
          images: Array.isArray(ld.images) ? ld.images.filter((x: unknown) => typeof x === "string") : [],
          coords: Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null,
        };
      }
    } catch (e) {
      console.warn("__NEXT_DATA__ parse failed", e);
    }
  }

  // Allgemein: JSON-LD + Meta-Tags + sichtbarer Text
  const ldJson = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1].trim()).join("\n");
  const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1];
  const text = stripHtml(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "),
  );
  if (text.length < 300 && !ldJson) {
    throw new UserFacingError(
      "Die Seite enthielt keine lesbaren Anzeigendaten (vermutlich Bot-Schutz). Bitte als PDF hochladen.",
    );
  }
  return {
    kind: "HTML-Seite, als Text",
    text: `${ldJson ? `Strukturierte Daten (JSON-LD):\n${ldJson.slice(0, 30_000)}\n\n` : ""}Seitentext:\n${text.slice(0, 80_000)}`,
    structured: null,
    images: ogImage ? [ogImage] : [],
    coords: null,
  };
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Claude

const SYSTEM_PROMPT = `Du bist ein erfahrener, unabhängiger Kfz-Sachverständiger und Gebrauchtwagen-Berater in Deutschland.
Du hilfst einer Privatperson, Gebrauchtwagen-Angebote von mobile.de, autoscout24 und ähnlichen Portalen einzuschätzen.
Du arbeitest gründlich, ehrlich und konkret: Du nennst typische Schwachstellen genau dieses Modells, dieser Generation und dieser Motorisierung,
beziehst Laufleistung, Alter, Preis, Ausstattung, Verkäufertyp und Anzeigentext ein und weist auf Ungereimtheiten in der Anzeige hin.
Du erfindest keine Fakten über das konkrete Fahrzeug: Was in der Anzeige fehlt, kennzeichnest du als unbekannt bzw. als Frage an den Verkäufer.
Allgemeines Modellwissen (bekannte Probleme, Wartungsintervalle, Rückrufe) darfst du verwenden, kennzeichne Unsicherheit aber ehrlich.
Schreibe auf Deutsch, klar und ohne Floskeln.`;

const TASK_PROMPT = `Aufgabe:
1. Extrahiere die Fahrzeugdaten aus der Anzeige in das Feld "vehicle". Unbekanntes = null. Preise und Zahlen als ganze Zahlen ohne Einheit.
   Erstzulassung im Format MM/JJJJ. PS ggf. aus kW umrechnen (kW × 1,36). Standort so genau wie in der Anzeige angegeben (PLZ, Ort, Straße).
2. Bewerte das Angebot im Feld "evaluation":
   - score: Gesamtnote 1–10 (10 = hervorragendes Angebot), verdict: Urteil in einem kurzen Satz.
   - summary: 3–5 Sätze Gesamteinschätzung.
   - price_assessment: Einordnung des Preises im Marktvergleich (nutze Marktdaten aus der Anzeige, falls vorhanden) mit Begründung und realistischem Verhandlungsziel.
   - pros / cons: konkrete Vor- und Nachteile genau dieses Angebots (nicht nur des Modells allgemein).
   - model_known_issues: bekannte Schwachstellen dieses Modells/Motors/Getriebes in dieser Generation, jeweils mit Bezug, ob bei dieser Laufleistung relevant.
   - inspection_checklist: worauf bei der Besichtigung und Probefahrt unbedingt zu achten ist, speziell für dieses Fahrzeug, mit kurzer Begründung; nach Wichtigkeit sortiert.
   - questions_for_seller: Fragen, die man vorab telefonisch klären sollte.
   - red_flags: Warnsignale in der Anzeige (z. B. Unfallschaden, fehlendes Scheckheft, unplausible Angaben, Exportverdacht). Leer lassen, wenn keine.
   - documents_to_check: Unterlagen, die man sich zeigen lassen sollte.`;

const str = { type: ["string", "null"] };
const int = { type: ["integer", "null"] };

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vehicle", "evaluation"],
  properties: {
    vehicle: {
      type: "object",
      additionalProperties: false,
      required: [
        "title", "make", "model", "variant", "price_eur", "price_negotiable", "first_registration",
        "mileage_km", "power_kw", "power_ps", "fuel", "transmission", "body_type", "color",
        "previous_owners", "accident_free", "service_history", "hu_until", "seller_name",
        "seller_type", "zip", "city", "street", "country_code", "equipment",
      ],
      properties: {
        title: { type: "string" },
        make: str, model: str, variant: str,
        price_eur: int, price_negotiable: { type: ["boolean", "null"] },
        first_registration: str, mileage_km: int, power_kw: int, power_ps: int,
        fuel: str, transmission: str, body_type: str, color: str,
        previous_owners: int, accident_free: { type: ["boolean", "null"] },
        service_history: str, hu_until: str,
        seller_name: str, seller_type: { anyOf: [{ type: "string", enum: ["Händler", "Privat"] }, { type: "null" }] },
        zip: str, city: str, street: str, country_code: str,
        equipment: { type: "array", items: { type: "string" } },
      },
    },
    evaluation: {
      type: "object",
      additionalProperties: false,
      required: [
        "score", "verdict", "summary", "price_assessment", "pros", "cons", "model_known_issues",
        "inspection_checklist", "questions_for_seller", "red_flags", "documents_to_check",
      ],
      properties: {
        score: { type: "integer" },
        verdict: { type: "string" },
        summary: { type: "string" },
        price_assessment: {
          type: "object",
          additionalProperties: false,
          required: ["rating", "explanation", "negotiation_target_eur"],
          properties: {
            rating: { type: "string", enum: ["sehr günstig", "günstig", "fair", "leicht erhöht", "zu teuer", "unklar"] },
            explanation: { type: "string" },
            negotiation_target_eur: int,
          },
        },
        pros: { type: "array", items: { type: "string" } },
        cons: { type: "array", items: { type: "string" } },
        model_known_issues: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["issue", "relevance"],
            properties: { issue: { type: "string" }, relevance: { type: "string" } },
          },
        },
        inspection_checklist: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item", "why"],
            properties: { item: { type: "string" }, why: { type: "string" } },
          },
        },
        questions_for_seller: { type: "array", items: { type: "string" } },
        red_flags: { type: "array", items: { type: "string" } },
        documents_to_check: { type: "array", items: { type: "string" } },
      },
    },
  },
};

type Analysis = {
  vehicle: {
    title: string; make: string | null; model: string | null; variant: string | null;
    price_eur: number | null; first_registration: string | null; mileage_km: number | null;
    power_ps: number | null; fuel: string | null; transmission: string | null;
    zip: string | null; city: string | null; street: string | null; country_code: string | null;
    [k: string]: unknown;
  };
  evaluation: Record<string, unknown>;
};

async function askClaude(content: ContentPart[]): Promise<Analysis> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new UserFacingError("OPENROUTER_API_KEY fehlt in den Supabase-Secrets.");
  const model = Deno.env.get("OPENROUTER_MODEL") || DEFAULT_MODEL;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Autosuche",
    },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      reasoning: { effort: "high" },
      response_format: {
        type: "json_schema",
        json_schema: { name: "fahrzeug_analyse", strict: true, schema: OUTPUT_SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new UserFacingError("OpenRouter-Schlüssel ungültig (OPENROUTER_API_KEY prüfen).");
    if (res.status === 402) throw new UserFacingError("OpenRouter-Guthaben aufgebraucht – bitte unter openrouter.ai aufladen.");
    throw new Error(`OpenRouter: ${msg}`);
  }

  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new UserFacingError("Antwort der KI war zu lang (abgeschnitten).");
  let text: string = typeof choice?.message?.content === "string"
    ? choice.message.content
    : (choice?.message?.content ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) {
    throw new UserFacingError(
      choice?.message?.refusal ? `Die KI hat die Analyse abgelehnt: ${choice.message.refusal}` : "Leere Antwort der KI.",
    );
  }
  // Falls doch Markdown-Codeblock drumherum
  text = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text) as Analysis;
  } catch {
    throw new Error("Antwort der KI war kein gültiges JSON");
  }
}

// ---------------------------------------------------------------------------
// Bild & Standort

async function storeImage(admin: SupabaseClient, userId: string, carId: string, src: string) {
  try {
    const res = await fetch(src, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    const ext = type.includes("webp") ? "webp" : type.includes("png") ? "png" : "jpg";
    const path = `${userId}/${carId}-${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from("car-images")
      .upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
    if (error) return null;
    return admin.storage.from("car-images").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function geocode(zip: string | null, city: string | null, street: string | null, country: string | null) {
  const cc = (country || "de").toLowerCase().slice(0, 2);
  const attempts: Record<string, string>[] = [];
  if (street && (zip || city)) attempts.push({ street, postalcode: zip ?? "", city: city ?? "" });
  if (zip) attempts.push({ postalcode: zip, ...(city ? { city } : {}) });
  if (zip) attempts.push({ postalcode: zip });
  if (city) attempts.push({ city });

  for (const a of attempts) {
    const params = new URLSearchParams({ ...a, countrycodes: cc, format: "json", limit: "1" });
    for (const [k, val] of [...params.entries()]) if (!val) params.delete(k);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": "autosuche-private-app/1.0", "Accept-Language": "de" },
      });
      if (!res.ok) continue;
      const hits = await res.json();
      if (Array.isArray(hits) && hits[0]) return { lat: Number(hits[0].lat), lng: Number(hits[0].lon) };
    } catch { /* nächster Versuch */ }
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim: max. 1 Anfrage/Sekunde
  }
  return null;
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
