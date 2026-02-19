# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Sports Tracking App

Eine React-basierte Sporttracking-App mit Strava-Integration und Backend-Persistenz für Trainingsziele.

### Features

- Strava OAuth Integration
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

# Build für Produktion
npm run build
```

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

Alle Requests müssen einen gültigen Strava Access Token im Authorization Header enthalten:
```
Authorization: Bearer <strava_access_token>
```

Die Function validiert den Token durch einen Call zu Strava's `/athlete` Endpoint und ermittelt daraus die Athlete ID. Nur Goals für diese Athlete ID können gelesen/geschrieben/gelöscht werden.

**Storage:**

Goals werden in Netlify Blobs gespeichert mit folgendem Key-Schema:
```
goals/<athleteId>/<year>/<sport>.json
```

Fallback: Falls Netlify Blobs nicht verfügbar ist (z.B. in lokaler Entwicklung), verwendet die Function einen In-Memory Store.

#### OAuth Functions

- `/.netlify/functions/oauth-callback` - Strava OAuth Callback
- `/.netlify/functions/oauth-refresh` - Token Refresh

### Umgebungsvariablen

Für Netlify-Deployment müssen folgende Environment Variables gesetzt sein:

```bash
STRAVA_CLIENT_ID=<your-strava-client-id>
STRAVA_CLIENT_SECRET=<your-strava-client-secret>
APP_BASE_URL=<your-app-url>
```

### Datenmodell

**Goals (Backend):**
```typescript
{
  athleteId: number;      // Strava Athlete ID
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
- Strava API Integration

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
