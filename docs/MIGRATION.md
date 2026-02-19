# Migration Guide: Goals Backend-Persistenz

## Was hat sich geändert?

Goals werden nun nicht mehr nur lokal gespeichert, sondern bei eingeloggten Nutzern auch im Backend persistiert. Dies ermöglicht:

- ✅ Synchronisierung über mehrere Geräte
- ✅ Persistenz auch bei Löschen des Browser-Caches
- ✅ Backup & Recovery
- ✅ Weiterhin Offline-Nutzung durch lokalen Cache

## Automatische Migration

**Keine manuellen Schritte erforderlich!**

Die App migriert bestehende lokale Goals automatisch beim nächsten Speichern:

1. **Lokale Goals bleiben erhalten**: Alle bestehenden Ziele in IndexedDB bleiben verfügbar
2. **Automatischer Upload**: Beim nächsten Ändern/Speichern eines Goals wird es automatisch ins Backend synchronisiert
3. **Nahtlose Nutzung**: Die UI verhält sich identisch - nur im Hintergrund wird nun zusätzlich das Backend genutzt

## Für nicht eingeloggte Nutzer

Falls kein Strava-Login vorhanden ist:

- Goals werden weiterhin **nur lokal** gespeichert (wie bisher)
- Die App funktioniert vollständig offline
- Bei späterem Login werden die lokalen Goals automatisch ins Backend synchronisiert

## Technische Details

### Stale-While-Revalidate Strategie

Die App nutzt eine intelligente Cache-Strategie:

```
1. UI lädt sofort lokale Daten (IndexedDB)
2. Parallel: Backend-Abfrage im Hintergrund
3. Bei neuerer Version im Backend: Cache-Update
4. UI wird automatisch aktualisiert
```

Dies sorgt für:
- ⚡ Schnelle UI (keine Wartezeit)
- 🔄 Automatische Synchronisierung
- 📱 Offline-Fähigkeit

### Versions-Tracking

Jedes Goal hat nun eine `version`:
- Startet bei 1
- Wird bei jedem Update inkrementiert
- Ermöglicht Konflikt-Erkennung zwischen Geräten

**Hinweis**: Wenn auf mehreren Geräten gleichzeitig gespeichert wird, gewinnt immer die letzte Änderung (Last-Write-Wins).

## Datenschutz

- Goals werden **pro Athlete ID** gespeichert (aus Strava Token ermittelt)
- Kein Zugriff auf Goals anderer Nutzer möglich
- Keine zusätzlichen Daten werden im Backend gespeichert
- Bei Logout bleiben lokale Goals erhalten

## Rollback (falls nötig)

Falls du nur lokal speichern möchtest:

1. Einfach nicht einloggen / ausloggen
2. Lokale Goals bleiben erhalten
3. Backend-Sync wird automatisch übersprungen

## Support

Bei Problemen:
- Lokaler Cache wird **immer** als Fallback genutzt
- Bei Netzwerkfehlern: App funktioniert weiterhin offline
- Token-Refresh erfolgt automatisch via `oauth-refresh.ts`
