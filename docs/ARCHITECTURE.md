# Architektur

## Ordnerstruktur

```
src/
  app/          App-Wurzel: Routen, Navigation, Lade-/Fehler-Gate, 404
  layouts/      App-Shell: Sidebar (Desktop), Icon-Rail (Tablet), Header + Drawer (Handy), Status-Banner
  components/
    ui/         Wiederverwendbare UI-Bausteine (Button, Card, Dialog, Field, Badge, EmptyState, …)
    brand/      Logo
  features/     Fachliche Bereiche, je ein Ordner: dashboard, projects, tasks, bugs, notes, snippets, codetester, statistics, settings, create, …
  domain/       Datenmodelle (Zod), Labels, reine Workspace-Operationen und Selektoren; domain/code: Analyse- und Format-Engine des Code Testers
  state/        React-Kontext: WorkspaceProvider verbindet Domain-Logik mit dem Repository
  storage/      Persistenz: Repository-Schnittstelle, localStorage-Implementierung, Migrationen, Fehlertypen
  hooks/        Generische Hooks (useZodForm)
  lib/          Kleine Helfer (IDs, Result-Typ, Formatierung, Download)
  styles/       Tailwind-Einstieg und Design-Tokens
  test/         Test-Setup, Fixtures, renderApp-Helfer
```

## Datenfluss

```
UI (features/*)  →  useWorkspaceActions()  →  WorkspaceProvider  →  domain/workspace.ts (rein)
                                                   ↓
                                          WorkspaceRepository  →  KeyValueStore (localStorage | Memory)
```

- **Komponenten greifen nie direkt auf `localStorage` zu.** Sie lesen über `useWorkspace()` und schreiben über `useWorkspaceActions()`.
- **Domain-Funktionen sind rein** (`addProject`, `setTaskStatus`, `getRecentItems`, …). Zeit und ID-Erzeugung werden hineingereicht, dadurch sind sie deterministisch testbar und später von einer Sync-Schicht wiederverwendbar.
- **Optimistische Updates:** Eine Änderung erscheint sofort; schlägt das Speichern fehl, zeigt ein Banner an, dass sie beim Neuladen verloren geht.

## Storage-Schicht

`WorkspaceRepository` (`src/storage/workspaceRepository.ts`) ist die einzige Schnittstelle zur Persistenz. Sie ist bewusst asynchron, obwohl `localStorage` synchron ist, damit später IndexedDB oder eine Cloud-Implementierung ohne Umbau der UI eingesetzt werden kann.

Die aktuelle Implementierung `KeyValueWorkspaceRepository`:

| Situation                                  | Verhalten                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Nichts gespeichert                         | Leerer Workspace                                                          |
| Ungültiges JSON                            | Fehler `corrupt`, Daten bleiben unangetastet, Recovery-Bildschirm         |
| Schema-Verletzung                          | Fehler `invalid` mit lesbaren Details                                     |
| Neuere Formatversion                       | Fehler `unsupported-version` (kein Überschreiben durch alte App-Versionen)|
| Ältere Formatversion                       | Migration Schritt für Schritt, Ergebnis wird zurückgeschrieben            |
| Speicher voll                              | Fehler `quota-exceeded`                                                   |
| `localStorage` blockiert                   | Fallback auf In-Memory-Speicher mit deutlicher Warnung                    |
| Änderung in anderem Tab                    | `storage`-Event → Workspace wird neu geladen                              |
| „Start fresh“ nach Ladefehler              | Rohdaten werden unter `void:workspace:backup:<Zeit>` gesichert            |

Vor jedem Schreiben wird erneut gegen das Zod-Schema validiert, damit nie ungültige Daten gespeichert werden.

### Datenformat und Migrationen

Das gespeicherte Dokument enthält `schemaVersion` (aktuell `4`; v1 → v2 ergänzt `technologies`/`links` bei Projekten und `projectId` bei Snippets, v2 → v3 ergänzt `tags` sowie `tagIds: []` bei allen Inhalten, v3 → v4 ergänzt `favorite: false` bei allen Inhalten). Bei einer Formatänderung:

1. `WORKSPACE_SCHEMA_VERSION` in `src/domain/models.ts` erhöhen und Schema anpassen.
2. In `src/storage/migrations.ts` eine Migration `[alteVersion]: (data) => ({ …, schemaVersion: alteVersion + 1 })` eintragen.
3. Einen Test mit einem gespeicherten Datensatz der alten Version ergänzen.

### Backup-Export und -Import

- **Format** (`src/storage/backup.ts`): `{ "format": "void-backup", "formatVersion": 1, "exportedAt": "…", "workspace": { "schemaVersion": 4, … } }`. Die Hülle ist getrennt vom Datenformat versioniert. Reine Workspace-Dateien aus VOID 0.1 werden weiterhin akzeptiert und migriert.
- **Prüfung vor dem Import:** Größe (max. 10 MB), JSON, Hülle, Datei- und Datenversion, Migrationen, vollständiges Zod-Schema, doppelte IDs in der Datei. Verweise auf fehlende Projekte werden geleert und in der Vorschau gemeldet.
- **Zusammenführen** (`src/domain/import.ts`, rein): Neue IDs werden ergänzt, identische Einträge nie doppelt importiert. Bei gleicher ID mit anderem Inhalt wählt der Nutzer: aktuelle Version behalten, Version aus der Datei übernehmen oder beide behalten (Kopien mit neuer ID, Verweise wandern mit).
- **Ersetzen** nur nach ausdrücklicher Bestätigung, mit Export-Knopf im Dialog.
- **Atomar:** `importWorkspace` ist als einzige Aktion nicht optimistisch. Der neue Stand wird erst gespeichert und nur bei Erfolg angezeigt; schlägt das Speichern fehl, bleiben Anzeige und gespeicherte Daten unverändert.

### Tags

- **Modell:** Tags stehen einmal in `workspace.tags` (`id`, `name`, `color`, Zeitstempel). Projekte, Aufgaben, Notizen und Snippets speichern nur `tagIds`. Umbenennen oder Umfärben ändert deshalb nur den Tag, Löschen entfernt nur seine ID aus den Inhalten.
- **Namen:** Leerzeichen werden zusammengefasst, Vergleiche ignorieren Groß-/Kleinschreibung (`tagKey`), angezeigt wird die Schreibweise des Nutzers. Max. 40 Zeichen, max. 20 Tags pro Inhalt, max. 500 Tags.
- **Farben:** feste Palette (`TAG_COLORS`) oder `null` für das neutrale Standardaussehen. Eine unbekannte Farbe in gespeicherten Daten fällt auf `null` zurück, statt das Laden zu verhindern.
- **Logik:** rein in `src/domain/tags.ts` (anlegen, umbenennen, löschen, Auswahl auflösen, Nutzung zählen, Lookup). Die UI liest über `useTagLookup` / `useItemTags` / `TagList` (`src/features/tags`).
- **Formulare:** Ein Tag-Selector für alle vier Formulare. Er hält eine Auswahl aus bestehenden IDs und neuen Namen; neue Tags entstehen erst beim Speichern, im selben Schritt wie der Inhalt. Abbrechen hinterlässt nichts.
- **Import:** Doppelte Tag-IDs in der Datei werden abgelehnt, gleichnamige Tags zusammengeführt, Verweise auf fehlende Tags entfernt (jeweils in der Vorschau gemeldet). Beim Zusammenführen wird ein vorhandener Tag gleichen Namens wiederverwendet; bei gleicher ID mit anderem Inhalt gilt die gewählte Konfliktregel, aber nie so, dass zwei Tags gleichen Namens entstehen.

### Favoriten und Filter

- **Favoriten:** `favorite: boolean` direkt an Projekt, Aufgabe, Notiz und Snippet. Alles außer `true` (fehlend, kaputt) gilt beim Laden als „kein Favorit“, statt das Laden zu verhindern. `setFavorite` in `src/domain/workspace.ts` ändert nur dieses Feld, nicht `updatedAt`. Bearbeiten übernimmt das Feld unverändert, Löschen entfernt es mit dem Eintrag. Beim Zusammenführen-Import zählt ein abweichender Favoritenstatus als Konflikt und folgt der gewählten Regel.
- **Filter:** rein in `src/domain/filters.ts`. Unterschiedliche Kriterien werden mit UND verknüpft, mehrere Werte eines Kriteriums mit ODER. Die Textsuche einer Liste nutzt dieselbe Suchlogik wie `Ctrl+K` (`search.ts`), es gibt also nur eine Suchlogik. Der Filterzustand ist reiner UI-Zustand (`ListFiltersProvider`), bleibt beim Seitenwechsel erhalten und wird nie gespeichert. Eine gemeinsame `FilterBar` für alle vier Übersichten.

### Code Tester (Update 4.2)

- **Analyse ist vom Editor getrennt.** `src/domain/code/` ist reine Logik ohne React: `languages.ts` (Sprachen und was sie können), `scanner.ts` (konfigurierbarer Lexer für Klammern/Strings/Kommentare), `rules/*` (Regeln je Sprache), `analyze.ts` (Einstieg, gibt `done | empty | unsupported | failed` zurück), `format.ts` (Prettier), `diff.ts` (Zeilen-Diff, Myers). Der Editor (`features/codetester/CodeEditor.tsx`, CodeMirror 6) zeigt nur an.
- **Code wird nie ausgeführt.** Es gibt kein `eval`, keinen Worker, kein Terminal, keine Netzwerkanfrage. Deep Scan nutzt Parser: TypeScript-Compiler-API (nur Parsen + Checker mit `noLib`, Diagnosen per Whitelist), Lezer-Grammatiken für Python/CSS/YAML, eigene Parser für JSON und HTML/XML.
- **Schwere Bibliotheken werden erst bei Bedarf geladen**: Code-Tester- und Statistik-Seite sind `React.lazy`-Routen, CodeMirror-Sprachen, Prettier-Plugins, TypeScript und Lezer-Parser sind dynamische Imports. Der Start lädt nichts davon.
- **Sitzung im Speicher:** `CodeTesterSessionProvider` (App-Ebene) hält Code, Sprache, Ergebnis und Format-Backup, solange VOID läuft. Ungespeicherter Code: Toast beim Verlassen der Seite, `beforeunload` im Browser, in Electron fragt `will-prevent-unload` (main.cjs) mit Leave/Stay.
- **Speichern** nutzt die vorhandenen Snippets (`createSnippetWithId`, `updateSnippet`), optional mit Projekt.

### Projektübersicht und Statistik (Update 4.2)

- `task.completedAt` und `bug.resolvedAt` (optional, Format bleibt v5, fehlend = `null` = „Datum unbekannt“). Gesetzt werden sie zentral in `WorkspaceProvider.commit` über `stampMilestones` (`domain/milestones.ts`), egal welche Aktion den Status ändert.
- `domain/projectOverview.ts` und `domain/statistics.ts` rechnen alles bei jedem Rendern aus den vorhandenen Daten. Nichts wird zusätzlich gespeichert, nichts geschätzt.

## Discord Rich Presence (4.3)

- **Getrennt vom Rest:** Die ganze Discord-Logik steckt in `electron/discordPresence.cjs` (IPC-Protokoll über `\\?\pipe\discord-ipc-N`, Wiederverbinden, Drosselung), die Application ID in `electron/discordConfig.cjs` (öffentlich, kein Geheimnis; `VOID_DISCORD_CLIENT_ID` überschreibt sie zum Testen). Kein npm-Paket, da `node_modules` ohnehin nicht in die EXE kommt. `main.cjs` lädt das Modul erst beim ersten Aufruf.
- **Privatsphäre per Konstruktion:** Die Seite schickt nur `enabled`/`showElapsed` und einen von drei Aktivitätsnamen (`idle`, `project`, `code-tester`). `preload.cjs` und das Modul verwerfen alles andere; die Texte (`Using VOID`, `Working on a project`, `testing a code`) stehen nur in der Shell. Ein Test prüft jede über die Pipe geschriebene Zeichenkette.
- **Seite:** `features/discord/DiscordPresenceProvider.tsx` leitet die Aktivität nur aus der Route ab (`domain/discordPresence.ts`, `/projects*` → Projekt, `/code-tester` → Code Tester). Einstellungen in den Preferences (`discord`, optional), Anzeige in `features/settings/DiscordSection.tsx`.
- **Stabilität:** Discord nicht da → Status `unavailable`, stille Wiederholung nach 15 s, 30 s, dann minütlich (ein Pipe-Versuch, keine Meldungen). Discord geschlossen → gleicher Weg. Falsche ID → `error`, keine Wiederholung. Aktualisierungen gebündelt (1 s) und doppelte unterdrückt. Beim Ausschalten und Beenden wird der Status in Discord gelöscht und die Pipe geschlossen.

## Annahmen und Entscheidungen

- **UI-Sprache Englisch**, weil die Navigationsbegriffe englisch vorgegeben waren und VOID international veröffentlicht werden soll. Texte sind zentral genug, um später i18n einzuführen.
- **Erstellen, Bearbeiten und Löschen** laufen für alle vier Entitäten über einen gemeinsamen `EntityDialogProvider` (`features/create`), damit jede Seite, auch die Projekt-Detailseite, dieselben Formulare und Bestätigungsdialoge nutzt. Rückmeldungen erscheinen als Toasts (`components/ui/ToastProvider.tsx`).
- **Projekt löschen** fragt, ob zugehörige Aufgaben, Notizen und Snippets behalten (dann ohne Projekt) oder mitgelöscht werden. Standard ist Behalten.
- **Kein Rückgängig** nach dem Löschen; der Bestätigungsdialog verweist auf den Export.
- **Kein globaler State-Manager** (Redux, Zustand): Für den MVP reichen Kontext + reine Funktionen.
- **Eigener Dialog statt Bibliothek**: Fokusfalle, Escape, Fokus-Rückgabe und Scroll-Sperre sind in `components/ui/Dialog.tsx` umgesetzt.
