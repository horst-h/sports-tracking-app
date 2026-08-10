# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Sports Tracking App

Eine React-basierte Sporttracking-App mit Runalyze als Datenquelle und Backend-Persistenz für Trainingsziele.

### Features

- Google Sign-In als App-Login (Identität für gespeicherte Ziele)
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

Alle Requests müssen ein gültiges Google ID Token im Authorization Header enthalten:
```
Authorization: Bearer <google_id_token>
```

Die Function verifiziert das Token lokal gegen Googles veröffentlichte Signaturschlüssel (Signatur, Issuer, Audience, Ablauf, verifizierte Mailadresse) und prüft das Konto gegen eine Allowlist. Ohne konfigurierte Allowlist wird niemand durchgelassen. Aus dem Subject entsteht der Storage-Key.

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
