# Goals API - Backend Dokumentation

## Übersicht

Die Goals API ermöglicht das Speichern, Laden und Löschen von Trainingszielen pro Sportler im Backend. Authentifizierung erfolgt über Strava Access Tokens.

## Endpoints

### GET Goals

Lädt ein gespeichertes Ziel für ein bestimmtes Jahr und eine Sportart.

**Request:**
```http
GET /.netlify/functions/goals?year=2025&sport=run
Authorization: Bearer <strava_access_token>
```

**Query Parameters:**
- `year` (required): Jahr als Zahl (z.B. 2025)
- `sport` (required): Sportart - `run` oder `ride`

**Response (200 OK):**
```json
{
  "goal": {
    "athleteId": 12345,
    "year": 2025,
    "sport": "run",
    "distanceKm": 1000,
    "count": 100,
    "elevationM": 10000,
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-02-15T12:30:00.000Z",
    "version": 3
  }
}
```

Wenn kein Ziel existiert:
```json
{
  "goal": null
}
```

**Fehler:**
- `401` - Ungültiges oder fehlendes Token
- `400` - Ungültige Parameter (year oder sport)

---

### PUT Goals

Erstellt oder aktualisiert ein Ziel.

**Request:**
```http
PUT /.netlify/functions/goals
Authorization: Bearer <strava_access_token>
Content-Type: application/json

{
  "year": 2025,
  "sport": "run",
  "distanceKm": 1000,
  "count": 100,
  "elevationM": 10000
}
```

**Body (JSON):**
- `year` (required): Jahr als Zahl
- `sport` (required): `run` oder `ride`
- `distanceKm` (optional): Distanzziel in Kilometern
- `count` (optional): Anzahl Aktivitäten
- `elevationM` (optional): Höhenmeter-Ziel

Mindestens eines der optionalen Felder sollte angegeben werden.

**Response (200 OK):**
```json
{
  "goal": {
    "athleteId": 12345,
    "year": 2025,
    "sport": "run",
    "distanceKm": 1000,
    "count": 100,
    "elevationM": 10000,
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-02-19T14:20:00.000Z",
    "version": 4
  }
}
```

**Fehler:**
- `401` - Ungültiges oder fehlendes Token
- `400` - Ungültige Daten (year, sport, oder Werte nicht valide)

---

### DELETE Goals

Löscht ein gespeichertes Ziel.

**Request:**
```http
DELETE /.netlify/functions/goals?year=2025&sport=run
Authorization: Bearer <strava_access_token>
```

**Query Parameters:**
- `year` (required): Jahr als Zahl
- `sport` (required): `run` oder `ride`

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Fehler:**
- `401` - Ungültiges oder fehlendes Token
- `400` - Ungültige Parameter

---

## Authentifizierung

Alle Requests benötigen einen gültigen Strava Access Token:

```http
Authorization: Bearer <strava_access_token>
```

Der Token wird validiert durch einen Call zu `https://www.strava.com/api/v3/athlete`. Die daraus ermittelte Athlete ID wird automatisch für alle Operationen verwendet - der Client kann diese **nicht** selbst bestimmen.

### Token-Handling im Frontend

Das Frontend nutzt `tokenRepository.ts` zum Laden des Access Tokens:

```typescript
import { loadToken } from "./repositories/tokenRepository";

const token = await loadToken();
if (token && token.expires_at > Date.now() / 1000) {
  // Token ist gültig
  const response = await fetch("/.netlify/functions/goals?year=2025&sport=run", {
    headers: {
      Authorization: `Bearer ${token.access_token}`
    }
  });
}
```

Bei abgelaufenem Token sollte die OAuth Refresh-Flow genutzt werden (siehe `oauth-refresh.ts`).

---

## Storage

Goals werden in **Netlify Blobs** gespeichert mit folgendem Key-Schema:

```
goals/<athleteId>/<year>/<sport>.json
```

Beispiel:
```
goals/12345/2025/run.json
goals/12345/2025/ride.json
```

### Fallback (Development)

Wenn Netlify Blobs nicht verfügbar ist (z.B. lokales Development ohne Netlify CLI), greift ein **In-Memory Store** als Fallback. Daten gehen hier bei Server-Restart verloren.

---

## Datenmodell

### StoredGoal

```typescript
{
  athleteId: number;      // Strava Athlete ID (wird durch Token-Validierung ermittelt)
  year: number;           // Zieljahr (2000-2100)
  sport: "run" | "ride";  // Sportart
  distanceKm?: number;    // Distanzziel in km (≥ 0)
  count?: number;         // Anzahl Aktivitäten (≥ 0, ganzzahlig)
  elevationM?: number;    // Höhenmeter-Ziel (≥ 0)
  createdAt: string;      // ISO 8601 timestamp
  updatedAt: string;      // ISO 8601 timestamp
  version: number;        // Versionszähler (startet bei 1, inkrementiert bei Update)
}
```

---

## Versionierung & Cache-Strategie

Die `version` wird bei jedem Update inkrementiert und ermöglicht dem Frontend optimistisches Caching mit Konflikt-Erkennung:

1. **Frontend cached lokal** (IndexedDB) mit Version
2. **Stale-while-revalidate**: UI zeigt Cache sofort, lädt parallel Backend
3. **Version-Vergleich**: Nur wenn Backend neuere Version hat, wird Cache aktualisiert

Siehe `goalsRepository.ts` für die Implementierung.

---

## Environment Variables

Für Deployment auf Netlify müssen folgende Variablen gesetzt sein:

```bash
STRAVA_CLIENT_ID=<your-strava-client-id>
STRAVA_CLIENT_SECRET=<your-strava-client-secret>
APP_BASE_URL=<your-app-url>
```

Diese werden für OAuth-Flows benötigt.

---

## Testing

### Lokal mit Netlify CLI

```bash
# Netlify Dev Server starten
netlify dev

# API testen
curl -H "Authorization: Bearer <valid-token>" \
  "http://localhost:8888/.netlify/functions/goals?year=2025&sport=run"
```

### Mit ungültigem Token

```bash
curl "http://localhost:8888/.netlify/functions/goals?year=2025&sport=run"
# Response: 401 {"error":"missing_authorization"}
```

---

## Fehlerbehandlung

Die API ist resilient designed:

- **Netzwerkfehler**: Frontend fällt auf lokalen Cache zurück
- **Token abgelaufen**: Frontend zeigt lokale Daten, triggert ggf. Refresh
- **Storage-Fehler**: In-Memory Fallback (Development) oder Retry-Logic
- **Ungültige Daten**: Validierung mit klaren Error-Codes (400)

---

## Migration von lokal-only zu Backend

Bestehende lokale Goals werden **nicht automatisch** ins Backend migriert. Bei erstem `saveGoals()` nach Login werden die Daten ins Backend geschrieben.

Um alte lokale Goals zu migrieren:

1. Nutzer meldet sich an (bekommt Token)
2. App lädt lokale Goals via `loadGoals()`
3. App speichert sie via `saveGoals()` → Sync ins Backend
4. Fortan nutzt die App Backend + lokalen Cache

Die bestehende Implementierung in `goalsRepository.ts` übernimmt dies automatisch.
