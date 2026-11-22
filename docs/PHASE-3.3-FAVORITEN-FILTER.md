# Phase 3.3 – Favoriten und Filter: Abschlussbericht

## Favoriten

- Stern-Schaltfläche (Lucide `Star`) an jedem Eintrag:
  - Projektkarten in der Projektübersicht
  - Projekt-Detailseite: Knopf mit Text („Add to favorites“ / „Favorite“)
  - Aufgabenzeilen (Aufgabenliste und Projekt-Detailseite)
  - Notizkarten (Notizenliste und Projekt-Detailseite)
  - Snippetkarten (Snippet Vault und Projekt-Detailseite; eine eigene Snippet-Detailansicht gibt es nicht)
- Inaktiv: leerer Stern, aktiv: gefüllter Stern in Akzentfarbe. Der Zustand ist also nicht nur über die Farbe erkennbar. `aria-pressed`, zugängliche Beschriftung („Add VOID to favorites“ / „Remove VOID from favorites“) und Tooltip.
- Ein Klick schaltet um, ohne Bestätigungsdialog. Der Klick stoppt die Weitergabe, öffnet also auf der Projektkarte nicht die Detailseite.
- Favorisieren zählt nicht als Bearbeitung: `updatedAt` bleibt gleich, „Recent activity“ springt nicht um.
- Bearbeiten, Statuswechsel und Tag-Änderungen behalten den Favoritenstatus. Löschen entfernt ihn mit dem Eintrag. Wird ein Projekt gelöscht und sein Inhalt behalten, behalten die Inhalte ihren Stern.
- Favoriten finden: „Favorites only“ in jeder Übersicht. Eine zentrale Favoritenseite habe ich bewusst weggelassen, weil die Filter das schon abdecken und die Navigation sonst wächst.

## Filter je Inhaltstyp

| Übersicht | Kriterien |
| --- | --- |
| Projekte | Status (Active, Paused, Archived), Tags, nur Favoriten, Textsuche |
| Aufgaben | Status (To do, In progress, Done), Priorität (High, Medium, Low), Projekt inkl. „No project“, Tags, nur Favoriten, Textsuche |
| Notizen | Projekt inkl. „No project“, Tags, nur Favoriten, Textsuche |
| Snippets | Sprache (gespeicherte Werte, Groß-/Kleinschreibung zusammengefasst, fehlende Werte als „No language“), Projekt inkl. „No project“, Tags, nur Favoriten, Textsuche |

- Verknüpfung: verschiedene Kriterien mit UND, mehrere Werte innerhalb eines Kriteriums mit ODER. Bei Tags steht das in der Oberfläche („Shows items with at least one of the selected tags.“).
- Optionen kommen aus den echten Daten: alle vorhandenen Status- und Prioritätswerte, nur die Projekte und Tags, die in der Liste vorkommen, mit Anzahl. Gelöschte Projekte oder Tags verschwinden automatisch aus aktiven Filtern.
- Aufbau: Suchfeld, „Favorites only“ und „Filters“ (mit Zähler) in einer Zeile, darunter das aufklappbare Filterpanel (Escape schließt es). Darunter „Showing 2 of 4 tasks“ (live für Screenreader), aktive Filter als kleine Chips mit ×, und „Reset all filters“.
- Leere Zustände: „No tasks yet“ (keine Einträge) bleibt wie bisher. „No tasks match your filters“ erscheint, wenn es Einträge gibt, aber keiner passt, mit Knopf zum Zurücksetzen.
- Mobil: alles bricht um statt überzulaufen, Optionslisten scrollen ab einer bestimmten Höhe intern, Chips werden mit „…“ gekürzt.
- Zustand: nur im Speicher für die laufende Sitzung. Seitenwechsel behalten die Filter, ein Neustart setzt sie zurück. Filter ändern nie die gespeicherten Daten.
- Suche: Das Suchfeld der Liste nutzt dieselbe Suchlogik wie `Ctrl+K` (Titel, Beschreibung, Code, Tags, Projektname …). Es gibt keine zweite Suchlogik und keinen zweiten Index. `Ctrl+K` funktioniert unverändert.
- Die frühere Umschaltung „Open / Done / All“ auf der Aufgabenseite ist in den Statusfilter gewandert. Die Aufgabenliste zeigt deshalb standardmäßig alle Aufgaben statt nur offene. Für „nur offene“ wählt man „To do“ und „In progress“.

## Datenmodell und Migration

- Datenformat **v4**: `favorite: boolean` an Projekt, Aufgabe, Notiz und Snippet (`src/domain/models.ts`).
- Migration 3 → 4 (`src/storage/migrations.ts`): setzt `favorite: false`, ein bereits vorhandener Wert bleibt erhalten. Alle anderen Daten bleiben unverändert. Ältere Daten (v1, v2) laufen durch alle Migrationen.
- Robust: Alles außer `true` (fehlend, `"yes"`, `null` …) wird beim Laden als „kein Favorit“ gelesen, statt die ganzen Daten unlesbar zu machen.

## Import und Export

- Der Export enthält `favorite` automatisch, weil es Teil der Einträge ist.
- Import alter Dateien (v1–v3): die Migration setzt `favorite: false`.
- Ersetzen: übernimmt die Favoriten aus der Datei.
- Zusammenführen: neue Einträge bringen ihren Favoritenstatus mit. Weicht nur der Favoritenstatus ab, ist das ein normaler Konflikt: „Keep current“ behält deinen Stern, „Use imported“ übernimmt den aus der Datei, „Keep both“ legt eine Kopie an. Die Validierung wird nicht umgangen.

## Mobile-Layout-Bug

- Ursache: Grid-Elemente haben standardmäßig `min-width: auto`. Ein `<li>` mit einem Snippet wurde dadurch mindestens so breit wie die längste Codezeile. Der `<pre>`-Block hatte zwar `overflow: auto`, kam aber nie dazu, selbst zu scrollen, weil schon seine Grid-Zelle mitwuchs.
- Behebung: `min-w-0` an den Grid-Einträgen (Projekt-Detailseite, Snippet Vault, Notizen, Projekte) und an Snippet- und Notizkarten. Der Codeblock scrollt jetzt intern.
- Zusätzlich brechen lange Wörter ohne Leerzeichen in Seitentitel, Projektbeschreibung, Detailwerten, Aufgabentiteln und Notizinhalt um (`overflow-wrap: anywhere`), gezielt pro Komponente, ohne globale Regel.
- Im Browser geprüft (375 px, Snippet mit 430 Zeichen langer Zeile ohne Leerzeichen): Ohne Fix war die Seite 3290 px breit, mit Fix 375 px, der Codeblock scrollt intern.

## Geänderte und neue Dateien

Neu:
- `src/domain/filters.ts`, `src/domain/filters.test.ts`, `src/domain/favorites.test.ts`
- `src/features/favorites/FavoriteButton.tsx`
- `src/features/filters/FilterBar.tsx`, `listFiltersContext.ts`, `ListFiltersProvider.tsx`
- `src/app/FavoritesFilters.test.tsx`
- `docs/PHASE-3.3-FAVORITEN-FILTER.md`

Geändert:
- `src/domain/models.ts`, `src/domain/workspace.ts`, `src/storage/migrations.ts`
- `src/state/workspaceContext.ts`, `src/state/WorkspaceProvider.tsx`, `src/app/App.tsx`
- `src/features/projects/ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `src/features/tasks/TasksPage.tsx`, `TaskRow.tsx`, `src/features/notes/NotesPage.tsx`, `NoteCard.tsx`, `src/features/snippets/SnippetsPage.tsx`, `SnippetCard.tsx`, `src/components/ui/PageHeader.tsx`
- Tests: `src/test/fixtures.ts`, `src/app/App.test.tsx`, `src/domain/import.test.ts`, `src/storage/backup.test.ts`, `src/storage/keyValueWorkspaceRepository.test.ts`
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`

## Prüfungen

- `npm run check` (Lint, Typecheck, Vitest, Vite-Build): alles grün, **223 Tests** in 13 Dateien (vorher 166).
- `npm run desktop:build`: erfolgreich → `release/VOID-0.1.0-portable.exe` (ca. 109 MB), kopiert nach `VOID.exe` im Projektordner. Hinweise von electron-builder: keine Codesignatur, Standard-Icon (wie bisher).

## Manuelle Tests

Im Vite-Dev-Server im eingebauten Browser, mit eigenen Testdaten (danach wieder gelöscht):
- v3-Daten geladen → automatisch auf v4 migriert
- Projekt-Detailseite mit sehr langer Codezeile bei 375 px: kein Seitenüberlauf
- Aufgaben: Filterpanel mobil geöffnet, Status-Filter kombiniert, Chips und „Reset all filters“ sichtbar, keine horizontale Scrollbar
- Stern an einer Aufgabe gesetzt → im Speicher `favorite: true`
- Snippets und Notizen bei 375 px ohne Überlauf, Projektübersicht am Desktop

Nicht manuell getestet: die fertige `VOID.exe`. Ich habe sie bewusst nicht gestartet, weil sie deine echten Daten öffnet und von v3 auf v4 migriert. Die Abläufe „App schließen und erneut öffnen“, Export/Import sowie Bearbeiten/Löschen mit Favoriten sind durch automatische Tests abgedeckt (Neustart durch erneutes Laden aus demselben Speicher), nicht durch einen Klicktest in der EXE.

## Offene Punkte

- Sortierung ist bewusst nicht Teil dieser Phase.
- Filter werden beim Neustart zurückgesetzt (gewollt: kein Speichern im Datenmodell).
- Eine Snippet-Detailansicht gibt es nicht; der Stern sitzt auf der Karte.
- Die Aufgabenliste zeigt jetzt standardmäßig auch erledigte Aufgaben (siehe oben).
