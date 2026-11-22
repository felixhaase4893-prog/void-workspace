# Phase 3.2 – Tag-System: Abschlussbericht

## Was umgesetzt wurde

- Eigene Tags für Projekte, Aufgaben, Notizen und Snippets. Es gibt keine fest eingebauten Tags; Nutzer legen sie selbst an.
- Ein gemeinsamer Tag-Selector in allen vier Formularen (Erstellen und Bearbeiten):
  - zeigt die zugeordneten Tags als Chips mit ×-Knopf
  - schlägt passende vorhandene Tags vor (Teiltreffer, Groß-/Kleinschreibung egal, bester Treffer zuerst, bis 50 Vorschläge mit Hinweis auf weitere)
  - „Create tag „…““ für neue Namen
  - Tastatur: `↑`/`↓` wählen, `Enter` oder `,` fügt hinzu, `Backspace` im leeren Feld entfernt den letzten Tag, `Escape` schließt erst die Vorschläge, dann den Dialog
  - Maus: Vorschlag anklicken, × an einem Chip
  - ein getippter, nicht bestätigter Name wird beim Verlassen des Feldes (z. B. direkt auf „Save“) übernommen
  - doppelte Tags werden verhindert („“UI” is already added.“), ein Name in anderer Schreibweise nutzt den vorhandenen Tag
  - Fehlermeldungen für zu lange Namen und das Limit von 20 Tags pro Inhalt
  - neue Tags entstehen erst beim Speichern; Abbrechen hinterlässt keine Tags
- Settings → **Tags**: alle Tags alphabetisch, Nutzung pro Tag („3 uses · 1 project, 2 tasks“), Tag erstellen, umbenennen, Farbe ändern, löschen. Ab 8 Tags erscheint ein Suchfeld, die Liste scrollt bei vielen Tags. Leerzustand mit Erklärung. In „Storage“ steht zusätzlich die Anzahl der Tags.
- Löschen fragt immer nach; bei verwendeten Tags mit Anzahl und Aufschlüsselung („This tag is used 2 times: 1 project, 1 task“) und dem Knopf „Remove from 2 items and delete“. Die Inhalte selbst bleiben unverändert.
- Farbpalette: Default (neutral) plus Violet, Blue, Teal, Green, Amber, Orange, Red, Pink, Slate. Heller Text auf leicht getöntem Grund, dezenter Rand, damit es ruhig bleibt und zum violetten Akzent passt. Vorschau im Dialog.
- Anzeige:
  - Projektkarten (max. 4 Tags + „+N“), Projekt-Detailseite (Zeile „Tags“, nur wenn vorhanden)
  - Aufgabenlisten (max. 5), Notizen (max. 5), Snippet Vault (max. 5), überall auch in der Projekt-Detailseite
  - Bearbeitungsdialoge über den Selector
  - Dashboard bewusst ohne Tags
  - Inhalte ohne Tags bekommen keinen leeren Bereich
  - lange Namen werden mit „…“ gekürzt (max. 12rem breit), voller Name im Tooltip
- Globale Suche: Tag-Namen sind durchsuchbar (Gewicht zwischen Titel und Beschreibung), Treffer zeigen bis zu 3 Tags als Chips, passende Tags zuerst und markiert.

## Wie das Tag-Datenmodell funktioniert

```
workspace.tags:   [{ id, name, color, createdAt, updatedAt }]
project/task/note/snippet.tagIds: ["<tag-id>", …]
```

- Tags liegen genau einmal zentral in `workspace.tags`. Inhalte speichern nur Tag-IDs (stabile Identität).
- Umbenennen/Umfärben ändert nur den Tag; alle Zuordnungen bleiben automatisch erhalten.
- Löschen entfernt den Tag und seine ID aus allen Inhalten. `updatedAt` der Inhalte bleibt dabei unverändert (ein Label zu verlieren ist keine Bearbeitung, die Reihenfolge „Recently edited“ bleibt stabil).
- Namen: Leerzeichen werden zusammengefasst und getrimmt, Vergleiche ignorieren Groß-/Kleinschreibung (`tagKey`), angezeigt wird die gewählte Schreibweise. 1–40 Zeichen, max. 20 Tags pro Inhalt, max. 500 Tags insgesamt.
- Farbe: ein Wert aus der Palette oder `null` (Default).
- Reine Logik in `src/domain/tags.ts`, getrennt von der UI: `createTag`, `updateTag`, `deleteTag`, `validateTagName`, `resolveTagSelection`, `createTagLookup`, `getTagsFor`, `hasTag`, `countTagUsage`, `sortTagsByName`, `mergeDuplicateTags`, `removeUnknownTagIds`.
- Vorbereitung für Phase 3.3: `hasTag(item, tagId)` und `getTagsFor(lookup, item.tagIds)` funktionieren für alle Inhaltstypen gleich; ein Tag-Filter ist damit ein einfaches `items.filter((item) => hasTag(item, id))`.

## Migration

Ja, eine Migration war nötig, weil sich das gespeicherte Format geändert hat: **v2 → v3**.

- Ergänzt `tags: []` und bei allen Projekten, Aufgaben, Notizen und Snippets `tagIds: []`. Sonst ändert sich nichts, alle Daten bleiben erhalten.
- Läuft automatisch beim Start; das Ergebnis wird zurückgeschrieben. Alte Backups (v1, v2) werden beim Import genauso hochgestuft.
- Robustheit: fehlende `tagIds`/`tags` werden als leer gelesen, doppelte IDs in einem Inhalt zusammengefasst, eine unbekannte Farbe fällt auf Default zurück. Tag-Verweise ohne Tag werden ignoriert (nicht angezeigt, nicht gezählt, beim nächsten Speichern des Inhalts entfernt). Wirklich kaputte Tag-Daten (z. B. leerer Name) führen wie bisher zum Recovery-Bildschirm, ohne dass Daten automatisch gelöscht werden.

## Import, Export und Suche

- **Export:** unverändertes Hüllformat (`formatVersion` 1), der Workspace darin hat jetzt `schemaVersion: 3` inklusive `tags` und `tagIds`.
- **Import-Prüfung** (`storage/backup.ts`): doppelte Tag-IDs → Datei abgelehnt; ungültige Tags → abgelehnt; Tags mit gleichem Namen in der Datei → zum ersten zusammengeführt; Verweise auf fehlende Tags → entfernt. Beides wird in der Vorschau gemeldet.
- **Zusammenführen** (`domain/import.ts`), definiertes Verhalten bei gleichem Namen mit unterschiedlicher ID: **der vorhandene Tag wird wiederverwendet**, die importierten Inhalte bekommen dessen ID, die aktuelle Farbe bleibt. Bei gleicher ID mit anderem Inhalt gilt die gewählte Konfliktregel (behalten / Version aus Datei / beide behalten mit neuer ID), aber nie so, dass zwei Tags gleichen Namens entstehen. Die Vorschau hat eine Zeile „Tags“, die Erfolgsmeldung nennt neue Tags.
- **Ersetzen:** Tags werden wie alles andere ersetzt.
- Ein fehlgeschlagener Import ändert weiterhin nichts (unverändert atomar).
- **Suche:** Der Index wird wie bisher pro Datenstand gebaut und löst Tag-Namen dabei über die aktuelle Tag-Liste auf. Jede Tag-Änderung erzeugt einen neuen Datenstand, daher gibt es nach Umbenennen oder Löschen keine veralteten Treffer. Die Invalidierung musste nicht angepasst werden.

## Geänderte und neue Dateien

Neu:
- `src/domain/tags.ts` – Tag-Logik
- `src/features/tags/TagSelector.tsx` – `TagField`/`TagSelector` für alle Formulare
- `src/features/tags/TagsSection.tsx`, `TagDialog.tsx`, `DeleteTagDialog.tsx` – Verwaltung in Settings
- `src/features/tags/TagChip.tsx`, `TagList.tsx`, `useTags.ts`, `tagColors.ts`, `usageText.ts`
- Tests: `src/domain/tags.test.ts`, `src/app/Tags.test.tsx`
- `docs/PHASE-3.2-TAGS.md` – dieser Bericht

Geändert:
- `src/domain/models.ts` – Tag-Schema, `tagIds`, Tag-Auswahl in Formular-Schemas, Version 3
- `src/storage/migrations.ts` – Migration v2 → v3
- `src/domain/workspace.ts` – Erstellen/Bearbeiten löst Tag-Auswahl auf
- `src/domain/import.ts`, `src/storage/backup.ts`, `src/features/settings/ImportDialog.tsx` – Tags bei Import/Export
- `src/domain/search.ts`, `src/features/search/SearchDialog.tsx` – Tags in der Suche
- `src/state/WorkspaceProvider.tsx`, `src/state/workspaceContext.ts` – Aktionen `createTag`, `updateTag`, `deleteTag`
- `src/hooks/useZodForm.ts` – erlaubt neben Strings auch die Tag-Auswahl als Formularwert
- `src/features/create/forms.tsx` – Tag-Feld in allen vier Formularen
- `src/features/projects/ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `src/features/tasks/TaskRow.tsx`, `src/features/notes/NoteCard.tsx`, `src/features/snippets/SnippetCard.tsx` – Anzeige
- `src/features/settings/SettingsPage.tsx` – Bereich „Tags“
- `src/test/fixtures.ts` – `tagIds` und `makeTag`
- bestehende Tests an das neue Format angepasst (`import.test.ts`, `backup.test.ts`), neue Fälle in `import.test.ts`, `backup.test.ts`, `keyValueWorkspaceRepository.test.ts`, `search.test.ts`
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`

Keine neuen Abhängigkeiten.

## Prüfergebnisse (29.10.2026)

- Lint (`eslint .`): ohne Fehler
- Typecheck (`tsc --noEmit`): ohne Fehler
- Vitest: **166 von 166 Tests bestanden** (10 Testdateien; vorher 111)
- Produktions-Build (`vite build`): erfolgreich
- Electron (`npm run desktop:build`): erfolgreich, `release/VOID-0.1.0-portable.exe` (113.915.516 Bytes), nach `VOID.exe` im Projektordner kopiert und byte-gleich geprüft
- Sichtprüfung im Browser (Desktop und 375 px Handy): Karten, Aufgaben, Settings, Selector im Dialog, Suche; kein horizontales Scrollen auf Projekte, Projekt-Detail, Aufgaben, Notizen, Snippets, Settings

Die EXE selbst wurde nicht gestartet; das deckt die Checkliste unten ab.

## Bekannte Einschränkungen

- Die Tag-Vorschläge im Formular stehen unter dem Feld (nicht als schwebendes Menü), damit sie im scrollenden Dialog nie abgeschnitten werden.
- Neue Tags aus dem Formular bekommen die Default-Farbe; Farbe in Settings ändern.
- Kein Filtern nach Tags in den Listen (kommt mit 3.3).
- Weiterhin offen aus 3.1: Ein Snippet mit sehr langer Code-Zeile macht die Projekt-Detailseite auf dem Handy zu breit.
- Ein veralteter Tag-Verweis wird nicht automatisch aus dem Speicher entfernt, sondern nur ignoriert (bewusst keine stille Reparatur); er verschwindet, sobald der Inhalt gespeichert wird.

## Manuelle Test-Checkliste

1. **Tag erstellen:** Settings → Tags → „New tag“, Name „Frontend“, Farbe Blue → erscheint in der Liste mit „Not used yet“. Noch einmal „frontend“ anlegen → Fehlermeldung „already exists“.
2. **Projekt:** Projekt bearbeiten → im Feld „Tags“ „Front“ tippen → „Frontend“ vorgeschlagen → Enter → speichern. Tag auf der Karte und auf der Detailseite sichtbar.
3. **Aufgabe:** neue Aufgabe → „Bug“ tippen → „Create tag “Bug”“ → Enter → speichern → Tag in der Aufgabenliste.
4. **Notiz und Snippet:** je einen vorhandenen Tag per Maus und einen neuen per Tastatur zuweisen. Einmal einen neuen Tag tippen und „Cancel“ drücken → der Tag darf in Settings nicht auftauchen.
5. **Umbenennen:** Settings → „Frontend“ bearbeiten → „Web Frontend“ → Projekt, Aufgabe, Notiz, Snippet zeigen den neuen Namen; Nutzungszahl unverändert.
6. **Verwendeten Tag löschen:** Settings → Mülleimer bei „Bug“ → Dialog nennt Anzahl und Arten → löschen → Aufgabe existiert noch, nur ohne Tag.
7. **Export/Import:** Settings → Export → „Delete all data“ → Datei importieren (Ersetzen) → Tags und Zuordnungen wieder da. Dann dieselbe Datei erneut im Modus „Merge“ importieren → „Nothing to import“, keine doppelten Tags.
8. **Neustart:** VOID schließen und neu öffnen → alles noch da.
9. **Suche:** `Ctrl+K` → Tag-Namen tippen → passende Inhalte mit markiertem Tag-Chip. Tag umbenennen und erneut suchen → alter Name findet nichts mehr.
10. **Handy-Viewport:** Fenster sehr schmal ziehen (oder DevTools ~375 px): Tags umbrechen, lange Namen werden gekürzt, Selector im Dialog bedienbar, kein seitliches Scrollen.

## Vorschlag für Phase 3.3

- Tag-Filter (ein oder mehrere Tags, UND/ODER) in Projekten, Aufgaben, Notizen und Snippets, per URL-Parameter teilbar; Tag-Chips anklickbar als Filter-Abkürzung
- Sortierung (zuletzt bearbeitet, erstellt, Name, Priorität/Status bei Aufgaben)
- Favoriten/Anheften als einfaches `pinned`-Feld (Migration v3 → v4), angeheftete oben
- Filter in der Suche (`tag:ui`, Typ-Filter)
- Optional: Farbe schon beim Anlegen im Selector wählen
