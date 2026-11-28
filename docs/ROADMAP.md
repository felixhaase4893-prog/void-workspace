# Roadmap

## Phase 1 – Fundament ✅

- Projekt-Setup, Design-Tokens, App-Shell mit responsiver Navigation
- Datenmodelle mit Zod, versioniertes local-first Storage mit Fehlerbehandlung
- Dashboard mit echten Kennzahlen, Projektübersicht, zuletzt bearbeitet, Schnellaktionen, Willkommenszustand
- Erstellen von Projekten, Aufgaben, Notizen und Snippets; Aufgaben abhaken; Snippets kopieren
- Settings: Speicherinfo, JSON-Export, alle Daten löschen
- Tests für Domain-Logik, Storage-Fehlerfälle und App-Verhalten

## Phase 2 – Datenverwaltung ✅

- Bearbeiten und Löschen aller Entitäten mit Bestätigung, Toasts und dauerhafter Speicherung
- Projekt-Detailseite mit Technologien, Links, zugehörigen Aufgaben, Notizen und Snippets
- Datenformat v2 mit Migration; Aufgabenstatus „In progress“ im Formular
- Versionierter JSON-Export; Import mit Validierung, Vorschau, Zusammenführen/Ersetzen und Konfliktbehandlung

## Phase 3 – in Arbeit

- 3.1 Globale Suche ✅ – lokal über Projekte, Aufgaben, Notizen und Snippets, `Ctrl+K`, Tastaturbedienung, gruppierte Treffer mit Markierung
- 3.2 Tags ✅ – eigene Tags mit Farben für alle Inhaltstypen, ein gemeinsamer Tag-Selector, Verwaltung in Settings, Suche nach Tags, Datenformat v3
- 3.3 Favoriten und Filter ✅ – Favoriten für alle Inhaltstypen, einheitliche Filterleiste (Status, Priorität, Projekt, Sprache, Tags, nur Favoriten, Textsuche), Datenformat v4
- Sortierung ✅
- Board-Ansicht

## Update 4.0 ✅

- Rückgängig nach dem Löschen (Projekte inkl. Inhalte, Aufgaben, Notizen, Snippets), ohne Papierkorb
- Markdown-Notizen mit Vorschau und Code-Highlighting
- Syntax-Highlighting für Snippets
- Eigenes App-Icon in der EXE

## Update 4.1 ✅

- Fälligkeitsdaten für Aufgaben (überfällig, heute, demnächst; Dashboard „Due soon“, Filter und Sortierung)
- Bug-Tracking mit Status, Priorität, Projekt und Fälligkeit, Datenformat v5
- Lokale Desktop-Benachrichtigungen mit Einstellungen und optionalem Infobereich-Modus
- Entwickler-Menü (`Ctrl+Shift+D`) mit markierten, entfernbaren Testdaten
- Schnellerer Start der EXE (Startbild, schlankeres Paket, Fenster sofort sichtbar)

## Update 4.2 ✅

- Quick Add (`Ctrl+N`), Schnellnavigation (`Ctrl+1`–`9`), Dashboard anpassen, Mehrfachauswahl, Suchverlauf
- Code Tester (`Ctrl+8`) mit Quick/Deep Scan und Formatter, Projektübersicht 2.0, Statistik (`Ctrl+9`)

## Update 4.3 ✅ (Abschluss der 4.x-Reihe)

- Discord Rich Presence mit drei festen, privaten Statuszeilen
- Fenstergröße/-position merken, Seiten starten oben, Code Tester und Statistik laden im Hintergrund vor
- Einheitliche Schalter in den Einstellungen, VOID-Version in *Settings → Storage*, robustere verschachtelte Dialoge

## Update 4.4 ✅ (PC Optimizer)

- PC Optimizer, phases A–C: read-only quick scan and deep scan, preview with live totals, validation, confirmation and a dry run only (see [PC-OPTIMIZER-A-C.md](PC-OPTIMIZER-A-C.md))
- Deep scan: performance hogs with step-by-step fixes, top CPU/GPU/RAM/network users, one-click open for folders and Windows settings
- Optimizer UI in English

## Später

- Befehlspalette (Aktionen zusätzlich zur Suche)
- Light Theme, i18n (Deutsch/Englisch)
- IndexedDB-Storage für größere Datenmengen
