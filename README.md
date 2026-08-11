# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Sports Tracking App

Eine React-basierte Sporttracking-App mit Runalyze als Datenquelle und Backend-Persistenz für Trainingsziele.

### Features

- Google Sign-In als App-Login (Identität für gespeicherte Ziele), danach eine eigene Session für 90 Tage
- Aktivitäten aus Runalyze über einen serverseitigen Proxy
- Aktivitäten-Tracking (Laufen, Radfahren)
- Jährliche Trainingsziele mit Backend-Persistenz
- AI-gestützte Insights und Prognosen
- Offline-Fähigkeit durch lokales Caching

### Setup & Entwicklung

```bash
# Dependencies installieren
npm install

# Dev Server starten
npm run dev

# Dev Server mit Netlify (Functions + Login, Port 8888)
npm run dev:netlify

oder 

npx netlify dev

# Build für Produktion
npm run build
```

Hinweis: Immer den Netlify-Dev-Server nutzen (Port 8888). Login, Runalyze-Proxy und Goals API laufen alle über Functions, der reine Vite-Server auf 5173 kennt sie nicht.

### Backend-Funktionen (Netlify Functions)

#### Goals API

Die Goals API ermöglicht es, Trainingsziele pro Sportler im Backend zu persistieren.

**Endpoints:**

- `GET /.netlify/functions/goals?year=YYYY&sport=run|ride`  
  Lädt ein gespeichertes Ziel für ein Jahr und eine Sportart.
  
- `PUT /.netlify/functions/goals`  
  Speichert oder aktualisiert ein Ziel.  
  Body: `{ year: number, sport: "run"|"ride", distanceKm?: number, count?: number, elevationM?: number }`
  
- `DELETE /.netlify/functions/goals?year=YYYY&sport=run|ride`  
  Löscht ein Ziel.

**Authentifizierung:**

Alle Requests laufen über die App-Session — ein HttpOnly-Cookie, das der Browser same-origin von selbst mitschickt. Siehe [Session](#session).

Alternativ akzeptiert das Gate weiterhin ein Google ID Token im Authorization Header (`Authorization: Bearer <google_id_token>`). Das ist der Weg, über den `/session` überhaupt erst eine Session ausstellt.

Google-Tokens werden lokal gegen Googles veröffentlichte Signaturschlüssel verifiziert (Signatur, Issuer, Audience, Ablauf, verifizierte Mailadresse), Session-Cookies gegen `SESSION_SECRET`. Beide Wege prüfen das Konto gegen dieselbe Allowlist — bei einem Cookie auf jedem Request, damit ein von der Liste genommenes Konto sofort draußen ist und nicht erst in 90 Tagen. Ohne konfigurierte Allowlist wird niemand durchgelassen. Aus dem Subject entsteht der Storage-Key.

#### Session

`POST|GET|DELETE /.netlify/functions/session`

- `POST { idToken }` — tauscht ein Google ID Token gegen das Session-Cookie. Einmalig beim Login.
- `GET` — meldet, wer angemeldet ist, und verlängert das Cookie, sobald es über die Hälfte seiner Laufzeit hinaus ist. Die App ruft das bei jedem Start auf; dadurch sind die 90 Tage ein gleitendes Fenster statt eines Countdowns.
- `DELETE` — Logout.

Ein Google ID Token lebt genau eine Stunde und lässt sich nicht erneuern — dieser Flow gibt kein Refresh-Token aus. Als Session verwendet, hieß das: stündlich neu anmelden. Es wird deshalb einmal benutzt und gegen ein serverseitig signiertes Token eingetauscht (HMAC-SHA256 über `SESSION_SECRET`, 90 Tage, gleitend).

Das Cookie ist `HttpOnly; Secure; SameSite=Lax; Path=/`. `HttpOnly` ist der Grund, warum die lange Laufzeit vertretbar ist: die Seite kann das Token nicht lesen. `SameSite=Lax` ist der CSRF-Schutz — alle Endpoints authentifizieren jetzt per Cookie, und Lax gibt es nur bei Top-Level-Navigation heraus, die hier nichts verändert. `Secure` entfällt nur auf localhost, sonst würde der Browser das Cookie in der lokalen Entwicklung verwerfen.

Im Browser liegt nur noch das Profil (Name, Mailadresse, Bild, Ablaufzeitpunkt) in IndexedDB — als Hinweis für die Oberfläche, damit die App offline und beim Start sofort angemeldet rendert. Entschieden wird nichts darauf; das tut ausschließlich die Serverprüfung des Cookies.

**Storage:**

Goals werden in Netlify Blobs gespeichert mit folgendem Key-Schema:
```
goals/google:<sub>/<year>/<sport>
```

Ziele aus der Strava-Zeit liegen unter `goals/<athleteId>/…`. Ist `LEGACY_GOALS_ATHLETE_ID` gesetzt, werden sie beim ersten Lesen auf den neuen Key kopiert; das Original bleibt liegen.

Fallback: Falls Netlify Blobs nicht verfügbar ist (z.B. in lokaler Entwicklung), verwendet die Function einen In-Memory Store.

#### Runalyze Proxy

`GET /.netlify/functions/runalyze?resource=activity|ping&page=&itemsPerPage=`

Der Browser kann die Runalyze-API nicht direkt ansprechen: nur der Custom-Header `token` authentifiziert, und der CORS-Preflight erlaubt ihn nicht. Der Proxy hält den Token serverseitig, lässt ausschließlich GET auf eine Resource-Allowlist zu und verlangt dieselbe Google-Authentifizierung wie die Goals API.

#### OAuth Functions (Strava, historisch)

- `/.netlify/functions/oauth-callback` - Strava OAuth Callback
- `/.netlify/functions/oauth-refresh` - Token Refresh

Strava ist nicht mehr die Datenquelle. Der Provider bleibt registriert, damit `?provider=strava` die bereits gecachten Jahre lesen kann; Live-Abrufe schlagen fehl.

### Umgebungsvariablen

Für Netlify-Deployment müssen folgende Environment Variables gesetzt sein:

```bash
# Runalyze (serverseitig, niemals VITE_-präfigiert)
RUNALYZE_API_TOKEN=<personal-api-token>

# Google Sign-In
GOOGLE_CLIENT_ID=<oauth-client-id>        # serverseitig, für die Audience-Prüfung
VITE_GOOGLE_CLIENT_ID=<oauth-client-id>   # im Browser, öffentlich
ALLOWED_GOOGLE_EMAILS=<deine-mailadresse> # oder ALLOWED_GOOGLE_SUBS

# App-Session (serverseitig, niemals VITE_-präfigiert)
SESSION_SECRET=<mindestens 32 Zeichen>    # openssl rand -base64 48

# optional: einmalige Übernahme der Ziele aus der Strava-Zeit
LEGACY_GOALS_ATHLETE_ID=<strava-athlete-id>

# Strava (historisch)
STRAVA_CLIENT_ID=<your-strava-client-id>
STRAVA_CLIENT_SECRET=<your-strava-client-secret>
APP_BASE_URL=<your-app-url>
```

Der Google-OAuth-Client braucht als *Authorised JavaScript origins* `http://localhost:8888` und die Netlify-URL. *Authorised redirect URIs* bleiben leer — der ID-Token-Flow leitet nicht um.

### Datenmodell

**Goals (Backend):**
```typescript
{
  subject: string;        // "google:<sub>"
  year: number;           // Zieljahr
  sport: "run" | "ride";  // Sportart
  distanceKm?: number;    // Distanzziel in km
  count?: number;         // Anzahl Aktivitäten
  elevationM?: number;    // Höhenmeter-Ziel
  createdAt: string;      // ISO timestamp
  updatedAt: string;      // ISO timestamp
  version: number;        // Versionszähler
}
```

**Lokaler Cache (IndexedDB):**

Goals werden auch lokal gecacht für Offline-Nutzung und schnelle UI-Reaktion. Die App verwendet eine "stale-while-revalidate" Strategie:
1. UI zeigt sofort gecachte Daten
2. Parallel wird Backend abgefragt
3. Bei neuerer Version aus Backend wird Cache aktualisiert

### Architektur

**Frontend:**
- React 19 + TypeScript
- React Router für Navigation
- IndexedDB (via idb) für lokalen Cache
- Vite als Build-Tool

**Backend:**
- Netlify Serverless Functions
- Netlify Blobs als Storage
- Runalyze API hinter einem Read-only-Proxy
- Google ID Token Verifikation (lokal, gegen Googles JWKS)
- App-Session als signiertes HttpOnly-Cookie (90 Tage, gleitend)

**Storage Layers:**
1. **Remote** (Netlify Blobs): Persistente Speicherung
2. **Local Cache** (IndexedDB): Offline-Fähigkeit + Performance
3. **Fallback** (In-Memory): Entwicklung ohne Netlify

---

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
