# Phase 3.1 – Globale Suche: Abschlussbericht

## Was implementiert wurde

- Globale, rein lokale Suche über Projekte, Aufgaben, Notizen und Snippets. Es wird nichts an externe Dienste gesendet, keine neuen Abhängigkeiten.
- Sucheinstieg in der Sidebar (Feld „Search“ mit `Ctrl K`-Hinweis, auf Tablets nur das Icon) und als Lupen-Button im Handy-Header.
- `Ctrl+K` öffnet die Suche (auch `⌘K`), `Escape` schließt sie, der Fokus landet automatisch im Suchfeld und geht beim Schließen zurück an das Element, das vorher fokussiert war.
- Pfeiltasten bewegen die Auswahl (mit Umlauf), `Enter` öffnet, Mausklick öffnet, Hover verschiebt die Auswahl.
- Treffer gruppiert nach Typ (Projects, Tasks, Notes, Snippets), je Treffer: Titel, Typ, zugehöriges Projekt, kurzer Kontextausschnitt mit Feldname (z. B. „Code: …“) und Markierung der Suchbegriffe.
- Zustände: noch keine Eingabe, nur Leerzeichen („Type a search term“), keine Treffer („Nothing found“), Treffer, Fehler beim Aufbereiten der Daten.
- Öffnen eines Treffers:
  - Projekt → Projekt-Detailseite `/projects/:id`
  - Aufgabe / Notiz / Snippet → jeweilige Listenseite plus der vorhandene Bearbeitungsdialog (es gibt dafür keine eigene Detailansicht, deshalb keine neuen Routen)
  - Existiert das Ziel nicht mehr, gibt es eine Toast-Meldung statt eines Absturzes. Wird etwas in einem anderen Fenster gelöscht, während die Suche offen ist, verschwindet der Treffer aus der Liste.

## Wie die Suche funktioniert

- `buildSearchIndex(workspace)` baut einmal pro Datenstand einen Index mit vorab kleingeschriebenen Feldern. Tippen scannt nur noch diesen Index. Fehlende oder kaputte Felder werden still als leer behandelt.
- Durchsuchte Felder (nur solche, die es im Datenmodell wirklich gibt):
  - Projekte: Name, Beschreibung, Technologien, Typ, Status, Link-Labels und -URLs
  - Aufgaben: Titel, Beschreibung, Status, Priorität, Projektname
  - Notizen: Titel, Inhalt, Projektname
  - Snippets: Titel, Beschreibung, Sprache, Code, Projektname
- Anfrage: getrimmt, Groß-/Kleinschreibung egal, an Leerzeichen in Begriffe geteilt, doppelte Begriffe entfernt (max. 8 Begriffe, 200 Zeichen).
- Mehrere Begriffe: **alle** müssen irgendwo im Eintrag vorkommen (UND), Reihenfolge egal. Teiltreffer zählen („datast“ findet „DataStore2“).
- Ranking: Titeltreffer zählen am meisten, exakter Titel bzw. Titelanfang gibt Bonus, danach zuletzt bearbeitet zuerst. Jeder Eintrag erscheint nur einmal. Pro Gruppe werden 6 Treffer gezeigt, die Gesamtzahl steht daneben („6 of 12“).
- Performance: Felder werden bis 20.000 Zeichen indexiert, das Suchfeld nutzt `useDeferredValue`, damit Tippen auch bei großen Datenmengen flüssig bleibt.
- Markierung über reine React-Elemente (`<mark>`), kein HTML-String, also kein XSS-Risiko.
- `Ctrl+K` wird ignoriert, solange der Fokus in einem Eingabefeld, Textfeld, Select oder contenteditable steckt oder ein anderer Dialog offen ist. Der Listener wird genau einmal registriert und beim Unmount entfernt.
- Barrierefreiheit: Dialog mit `aria-modal`, Combobox-Muster (`role="combobox"`, `aria-activedescendant`, `listbox` / `group` / `option`), unsichtbare Live-Region mit Trefferzahl, sichtbarer Fokus, `prefers-reduced-motion` greift über die bestehenden globalen Styles.
- Mobil: Der Dialog sitzt oben (neue Variante `placement="top"` im bestehenden `Dialog`), damit die Bildschirmtastatur nichts verdeckt; max. 85 % Höhe, 16‑px-Schrift im Feld gegen Auto-Zoom.

## Geänderte und neue Dateien

Neu:
- `src/domain/search.ts` – Suchlogik (Index, Matching, Ranking, Kontext, Markierung)
- `src/domain/search.test.ts` – 17 Unit-Tests
- `src/features/search/SearchProvider.tsx` – Dialogzustand, `Ctrl+K`, Öffnen der Ziele
- `src/features/search/SearchDialog.tsx` – Oberfläche
- `src/features/search/SearchButton.tsx` – Sucheinstieg Sidebar / Handy
- `src/features/search/HighlightedText.tsx`, `searchContext.ts`, `shortcut.ts`
- `src/app/Search.test.tsx` – 10 Integrationstests
- `docs/PHASE-3.1-SUCHE.md` – dieser Bericht

Geändert:
- `src/components/ui/Dialog.tsx` – zusätzliche Platzierung `top`, bestehende Varianten unverändert
- `src/app/App.tsx` – `SearchProvider` eingehängt
- `src/layouts/Sidebar.tsx`, `src/layouts/MobileHeader.tsx` – Sucheinstieg
- `src/features/notes/NotesPage.tsx`, `projects/ProjectsPage.tsx`, `snippets/SnippetsPage.tsx` – „Search“ aus den „Not implemented yet“-Hinweisen entfernt
- `docs/ROADMAP.md`

Datenmodell, Datenformat v2 und Migrationen: **unverändert**.

## Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Lint (`eslint .`) | ✅ ohne Fehler |
| Typecheck (`tsc --noEmit`) | ✅ ohne Fehler |
| Tests (`vitest run`) | ✅ 111 / 111 (84 bestehende + 27 neue), 8 Dateien |
| Produktions-Build (`vite build`) | ✅ |
| Portable EXE (`npm run desktop:build`) | ✅ `release/VOID-0.1.0-portable.exe`, nach `VOID.exe` im Projektordner kopiert (Hash identisch) |

Zusätzlich im Browser geprüft (Desktop und 375 px Handy-Breite): Öffnen per `Ctrl+K` und Button, Tippen, Pfeiltasten, `Enter` auf Aufgabe (öffnet Bearbeitungsdialog) und Projekt (öffnet Detailseite), Fokus zurück auf den Such-Button.

## Manuelle Tests für dich

1. `VOID.exe` starten, `Ctrl+K` drücken, etwas tippen, mit Pfeiltasten wählen, `Enter`.
2. Einen Projektnamen suchen → Detailseite öffnet sich.
3. Aufgabe, Notiz und Snippet suchen → jeweils der Bearbeitungsdialog öffnet sich.
4. Nach einem Wort mitten im Code eines Snippets suchen.
5. Zwei Wörter suchen, die nur zusammen in einem Eintrag vorkommen.
6. In einem Formularfeld `Ctrl+K` drücken → die Suche darf **nicht** aufgehen.
7. Nur Leerzeichen eingeben → Hinweis statt Ergebnissen.
8. Fenster schmal ziehen bzw. Handy-Ansicht: Lupe im Header, Dialog oben, nichts abgeschnitten.

## Bekannte Einschränkungen

- Aufgaben, Notizen und Snippets haben keine eigene Detailansicht; die Suche öffnet ihren Bearbeitungsdialog. Bei einer erledigten Aufgabe steht dahinter die Aufgabenliste mit Filter „Open“, die Aufgabe selbst ist dort also nicht sichtbar, nur im Dialog.
- Keine Tippfehler-Toleranz (kein Fuzzy-Matching), keine Phrasensuche mit Anführungszeichen.
- Text jenseits von 20.000 Zeichen in einer Notiz oder einem Snippet wird nicht durchsucht.
- Das Tastenkürzel ist bewusst inaktiv, solange ein anderer Dialog offen ist oder der Fokus in einem Textfeld liegt.
- Gefunden nebenbei, **nicht** behoben (gehört nicht zu dieser Phase): Auf Handy-Breite macht ein Snippet mit einer sehr langen Codezeile die Projekt-Detailseite breiter als den Bildschirm. Ursache: die Grid-Einträge der Snippet-Liste haben kein `min-w-0`. Ist eine Ein-Zeilen-Korrektur.
