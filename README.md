# Autosuche

Private App für die Gebrauchtwagensuche: Links zu Inseraten (autoscout24, mobile.de …) oder
Anzeigen als PDF hinzufügen → die App liest die Daten aus, zeigt das Fahrzeug mit Vorschaubild
auf einer Karte und erstellt eine KI-Bewertung (Vor-/Nachteile, Preiseinschätzung, bekannte
Schwachstellen, Checkliste für die Besichtigung, Fragen an den Verkäufer).

## Aufbau

- **Frontend:** React + Vite + Tailwind, Karte mit Leaflet/OpenStreetMap → Vercel
- **Backend:** Supabase-Projekt `autosuche` (Auth, Postgres, Storage, Realtime)
- **Edge Function** `analyze-listing`: liest die Anzeige (Link oder PDF), lässt Claude
  (`claude-opus-5-5`, direkt oder über OpenRouter) Daten extrahieren und bewerten, ermittelt den Standort
  (autoscout24-Koordinaten bzw. OpenStreetMap/Nominatim) und speichert alles.
  Die Analyse läuft im Hintergrund; die App aktualisiert sich per Realtime.

## Woher die Daten kommen

| Quelle | Funktioniert so |
|---|---|
| autoscout24-Link | Daten inkl. Bildern, Koordinaten und Marktpreis-Vergleich direkt aus der Seite |
| mobile.de-Link | wird meist vom Bot-Schutz blockiert → als PDF hochladen |
| PDF (Browser: Drucken → Als PDF speichern) | Claude liest das PDF; das Titelbild wird im Browser aus dem PDF gezogen |

Link und PDF können zusammen angegeben werden (dann gibt es auch den „Zur Anzeige“-Button).

## Einrichtung (einmalig)

1. **KI-Schlüssel** in Supabase hinterlegen: Dashboard → Edge Functions → Secrets →
   `ANTHROPIC_API_KEY` (direkt bei Anthropic, Modell `claude-opus-5-5`).
   Alternative: `OPENROUTER_API_KEY` (openrouter.ai), optional `OPENROUTER_MODEL`.
   Ist `ANTHROPIC_API_KEY` gesetzt, wird immer Anthropic direkt genutzt.
2. **Login anlegen:** Dashboard → Authentication → Users → *Add user* (E-Mail + Passwort,
   „Auto Confirm“ anhaken). Danach das Konto freischalten (SQL Editor):
   `insert into public.members (user_id) select id from auth.users where email = '…';`
   Alle freigeschalteten Konten sehen und bearbeiten dieselben Fahrzeuge und dasselbe Profil.
3. **Registrierung sperren:** Authentication → Sign In / Providers → *Allow new users to sign up* aus.
4. **Vercel:** Projekt aus diesem Repo importieren (Framework: Vite). Umgebungsvariablen sind in
   `.env.production` bereits enthalten (nur öffentliche Werte).

## Lokal starten

```bash
npm install
npm run dev
```

## Edge Function neu deployen

```bash
npx supabase functions deploy analyze-listing --project-ref kbehbkvhuuhxqyqdsife --no-verify-jwt
```
(Die Funktion prüft den Login selbst.)
