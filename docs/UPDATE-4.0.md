# VOID Update 4.0

Stand: 22.11.2026. Rein lokal, keine Cloud, keine Accounts.

## 1. Rückgängig nach dem Löschen

- Nach jedem Löschen (Projekt, Aufgabe, Notiz, Snippet) erscheint ein Toast mit **Undo**. Er bleibt 8 Sekunden; solange Maus oder Tastaturfokus darauf liegen, läuft die Zeit nicht ab.
- Die Löschung wird sofort gespeichert. Gleichzeitig entsteht im Speicher ein Wiederherstellungs-Datensatz (`src/domain/undo.ts`): die entfernten Elemente mit ihren alten Positionen und Nachbarn sowie bei Projekten die Inhalte, die mitgelöscht oder nur „abgehängt“ wurden.
- **Undo** fügt diesen Datensatz in den *aktuellen* Stand ein, statt den ganzen Workspace zurückzusetzen. Dadurch gehen andere Löschungen oder Änderungen in der Zwischenzeit nie verloren, und mehrere Undos funktionieren in beliebiger Reihenfolge.
- Beziehungen: Projektinhalte kommen mit dem Projekt zurück. Behaltene Inhalte werden wieder dem Projekt zugeordnet (mit ihrem alten Zeitstempel), außer sie wurden inzwischen einem anderen Projekt zugewiesen. Inzwischen gelöschte Tags werden entfernt. Ein Element, dessen Projekt inzwischen gelöscht wurde, kommt ohne Projekt zurück. Das Ergebnis ist immer ein gültiger Workspace.
- Nach Ablauf der Frist wird der Datensatz verworfen. Es gibt keinen Papierkorb.

## 2. Markdown-Notizen

- Eigener, kleiner Parser ohne Abhängigkeiten (`src/domain/markdown.ts`). Er erzeugt einen Datenbaum, der als React-Elemente gerendert wird. Es gibt kein `dangerouslySetInnerHTML`: HTML in Notizen erscheint als Text.
- Unterstützt: Überschriften, fett, kursiv, durchgestrichen, Inline-Code, Codeblöcke (mit Highlighting), Aufzählungen, nummerierte Listen, Aufgabenlisten, Verschachtelung, Zitate, Trennlinien, Links.
- Links werden nur für `http(s)` erzeugt (`javascript:`, `data:`, `file:` usw. bleiben Text). Sie öffnen mit `target="_blank" rel="noopener noreferrer"`; in der Desktop-App im Systembrowser.
- Editor mit Tabs **Write / Preview** und einer kleinen Formatierungsleiste. Gespeichert wird weiter der Rohtext, also kein neues Datenformat.
- Notizkarten zeigen die formatierte Notiz und blenden nur lange Notizen unten aus.

## 3. Syntax-Highlighting für Snippets

- `lowlight` (highlight.js-Grammatiken) mit 24 ausgewählten Sprachen, Zuordnung über das vorhandene Sprachfeld (z. B. „C#“, „Shell“, „Luau“ → Lua). Unbekannte Sprachen (z. B. GDScript) werden schlicht angezeigt. Bewusst keine automatische Erkennung, weil sie bei kurzen Snippets unzuverlässig ist.
- Ergebnis ist ein Token-Baum, kein HTML-String. Der angezeigte Text ist garantiert identisch mit dem gespeicherten Code (sonst wird ohne Farben angezeigt).
- Lange Zeilen scrollen im Codeblock; der bisherige Mobile-Fix (`min-w-0`) bleibt erhalten. Kopieren kopiert den Originalcode; bearbeitet wird weiter im normalen Textfeld.

## 4. App-Icon

- Motiv: dunkle Kachel, unterbrochene Umlaufbahn, ein heller Partikel entweicht durch die Lücke.
- `npm run icons` (`scripts/generate-icons.mjs`, nur Node.js) erzeugt `build/icon.ico` (16 bis 256 px), `build/icon.png` (512), `public/icon.png` (256) und `public/favicon.svg`. Das In-App-Logo nutzt dieselbe Form.
- `electron-builder.json`: `win.icon = build/icon.ico` und `signAndEditExecutable: true`, damit das Icon wirklich in die EXE geschrieben wird. `electron/main.cjs` setzt das Fenster-Icon.
- Geprüft: Das aus `VOID.exe` und `release/win-unpacked/VOID.exe` ausgelesene Icon ist das neue.

## Abhängigkeiten

- Neu: `lowlight` (zieht `highlight.js`, `devlop`, `@types/hast` mit). Sonst nichts.

## Datenformat

- Unverändert v4, keine Migration nötig.

## Tests

- 327 Tests grün (vorher 241, also 86 neue): `undo.test.ts`, `markdown.test.ts`, `highlight.test.ts`, `Undo.test.tsx`, `NotesSnippets.test.tsx`, `AppIcon.test.ts`.
