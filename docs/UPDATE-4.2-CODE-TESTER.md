# VOID Update 4.2 – Code Tester, Projektübersicht 2.0, Statistik

Stand: 22.11.2026. Rein lokal: kein Ausführen von Code, kein Terminal, keine Cloud, keine KI, kein Upload, keine externen Server. Datenformat bleibt **v5** (keine Migration). Logo und App-Icon unverändert. UI Englisch.

## 1. Neue Funktionen

**Code Tester** (Sidebar, `Ctrl+8`)
- Editor (CodeMirror 6): Syntax-Highlighting, Zeilennummern, Auto-Einrückung, Klammern schließen, Suchen (`Ctrl+F`), Zeilenumbruch umschaltbar, Einfügen/Kopieren, Sprache manuell wählbar, max. **2.000 Zeilen** (längere Eingaben werden abgelehnt, mit Hinweis).
- Editor und Analyse nebeneinander (ab 1024 px) bzw. untereinander, Trenner per Maus oder Pfeiltasten verschiebbar, Größe wird gemerkt.
- **Quick Scan**: Klammern, Strings, Kommentare und offensichtliche Probleme. **Deep Scan**: parserbasiert (siehe Punkt 3) plus mehr Regeln.
- Ergebnisse in **Errors / Warnings / Info / Suggestions**, jeweils mit Titel, Beschreibung, Zeile, Kategorie, Schweregrad und ggf. Vorschlag. Klick springt zur Zeile, Marker im Editor. Kategorien per Klick ein-/ausblendbar.
- Eigene Zustände: noch keine Analyse, nichts zu analysieren, „No problems found“ (mit dem Hinweis, dass eine saubere statische Analyse kein Beweis ist), nicht verfügbar für diese Sprache, Analyse fehlgeschlagen. Hinweis, wenn sich der Code seit dem Scan geändert hat.
- **Formatieren**: Vorschau mit Diff und formatierter Fassung, wird erst nach „Apply formatting“ übernommen, danach „Restore original“. Sprachen ohne zuverlässigen Formatter bekommen eine klare Meldung.
- **Scratch-Modus**: kein Projekt, kein Autosave. Code bleibt erhalten, solange VOID läuft. Warnung beim Verlassen der Seite (Toast) und beim Schließen der App (Dialog „Leave / Stay“).
- **Speichern**: als neues Snippet oder in ein bestehendes Snippet, optional mit Projekt. Snippets lassen sich aus dem Snippet Vault direkt im Code Tester öffnen (neues Symbol an jeder Snippet-Karte).

**Projektübersicht 2.0** (Projekt-Detailseite oben)
- Fortschritt = erledigte / alle Aufgaben (z. B. 6 von 10 = 60 %, abgerundet). Ohne Aufgaben: „No tasks yet“ statt falscher 0 %.
- Offene / erledigte Aufgaben, offene / geschlossene Bugs, nächste Fälligkeiten (überfällige zuerst), letzte Änderungen im Projekt.

**Statistik** (Sidebar, `Ctrl+9`)
- Dashboard-Karte „Statistics“: Completed tasks, Open tasks, Closed bugs, Active projects, jeweils mit „in den letzten 7 Tagen“. Ausblend- und verschiebbar wie die anderen Karten.
- Statistik-Seite: Zeitraum 7 / 30 / 90 Tage / All time. Aufgaben (offen, erledigt, erstellt/erledigt im Zeitraum, Balkendiagramm), Bugs (offen, geschlossen, gemeldet/geschlossen im Zeitraum, Diagramm), Projekte (aktiv/pausiert/archiviert) und Vergleich aller aktiven und pausierten Projekte mit Fortschrittsbalken.
- Nur echte Daten, Leerzustände, aktualisiert sich sofort bei jeder Änderung.

## 2. Unterstützte Sprachen (Editor + Highlighting)

JavaScript, TypeScript, Python, HTML, CSS, SCSS, JSON, Java, C#, C++, C, PHP, SQL, Bash, PowerShell, YAML, Go, Rust, Kotlin, Swift, Lua, Ruby, XML, TOML, Dockerfile, Plain text (26).

## 3. Analyse und Formatierung je Sprache

| Stufe | Sprachen |
|---|---|
| Deep Scan mit echtem Parser | JavaScript, TypeScript (TypeScript-Compiler), Python, CSS, YAML (Lezer), JSON, HTML (eigene Parser) |
| Deep Scan heuristisch (Regeln, kein Compiler) | SCSS, Java, C#, C++, C, PHP, SQL, Bash, PowerShell |
| Nur Quick Scan | Go, Rust, Kotlin, Swift, Lua, XML |
| Nur Highlighting | Ruby, TOML, Dockerfile, Plain text |
| **Formatieren** (Prettier) | JavaScript, TypeScript, JSON, CSS, SCSS, HTML, YAML |

Der Deep-Scan-Text in der App sagt bei jeder Sprache, wie weit die Prüfung geht. Deep Scan tut nirgends so, als wäre er ein Compiler.

## 4. Neue Abhängigkeiten

- CodeMirror 6: `@codemirror/state, view, commands, language, autocomplete, search, lint, legacy-modes` und die Sprachpakete `lang-javascript, python, html, css, json, java, cpp, php, sql, yaml`; dazu `@lezer/highlight`, `@lezer/common`, `@lezer/python`, `@lezer/css`, `@lezer/yaml`.
- `prettier` 3.10.1 (Standalone, nur im Renderer).
- `typescript` (war schon für den Build da) steht jetzt bei den Laufzeit-Abhängigkeiten, weil der Deep Scan die Compiler-API nutzt.
- Alles wird von Vite gebündelt und **nur bei Bedarf geladen**. In die EXE kommen weiterhin keine `node_modules`.

## 5. Architektur-Änderungen

- `src/domain/code/`: Analyse- und Format-Engine ohne React (Sprachen, Lexer, Regeln je Sprache, Analyse-Einstieg, Prettier, Zeilen-Diff). Der Editor zeigt nur an.
- `src/features/codetester/`: Seite, Editor, Ergebnisliste, Format- und Speichern-Dialog, Split-Pane, Sitzung im Speicher (`CodeTesterSessionProvider`).
- `src/features/statistics/` (Seite, Balkendiagramm ohne Bibliothek), `src/domain/statistics.ts`, `src/domain/projectOverview.ts`, `src/features/projects/ProjectOverviewPanel.tsx`, Dashboard-Karte `StatisticsCard`.
- Code Tester und Statistik sind lazy geladene Routen. Start der entpackten App gemessen: ca. 0,62 s bis Dashboard (vorher ca. 0,65 s), also kein Rückschritt.
- Electron: `will-prevent-unload` fragt beim Schließen mit ungespeichertem Code nach.

## 6. Datenmodell / Migrationen

- Neu und optional: `task.completedAt`, `bug.resolvedAt`. Fehlend oder kaputt = `null`. Deshalb **kein** Versionssprung, Format bleibt v5, alte Daten und Backups laden unverändert.
- Gesetzt zentral bei jeder Statusänderung (auch Mehrfachauswahl, Quick Add, Undo), beim Wiederöffnen wieder gelöscht.
- Dashboard-Layouts aus älteren Versionen bekommen die neue Statistik-Karte automatisch angehängt.

## 7. Tests

**549 Tests grün** (vorher 463, also 86 neue): Analyse-Engine 41, Formatierung 9, Zeitstempel 6, Projektübersicht 7, Statistik 7, Dashboard-Layout 1, UI-Tests 15 (Code Tester: Sprachwahl, Zeilenlimit, Quick/Deep Scan, Filter, Sprung zur Zeile, „nicht verfügbar“, Formatieren mit Vorschau/Übernehmen/Wiederherstellen, Speichern als Snippet mit Projekt, Snippet öffnen und zurückspeichern, Scratch-Warnung; Projektübersicht; Statistikseite mit Live-Update; Dashboard-Karte). Einige alte Tests mussten nur genauer zielen, weil Texte jetzt doppelt vorkommen (Dashboard, Projektseite).

## 8. Lint / TypeScript / Build

- `eslint .`: 0 Probleme. `tsc --noEmit` (strict): 0 Fehler. `vite build`: ok (Hinweis auf Chunks > 500 kB wie bisher; der TypeScript-Chunk lädt erst beim ersten Deep Scan von JS/TS).
- `npm run desktop:build`: ok.
- Manuell geprüft in der gebauten App (eigenes Test-Profil): Start, Code Tester lädt, Tippen, Sprachwechsel, Quick und Deep Scan, Statistik-Seite, Toast beim Verlassen, Schließen-Dialog mit „Stay“ (App bleibt offen) und „Leave“ (App schließt). Im Browser zusätzlich Statistik und Dashboard-Karte in Handybreite.

## 9. EXE

- `VOID.exe` (portable, ca. 318 MB) und der schnell startende Ordner `VOID-App\VOID.exe` (beide neu).

## 10. Bekannte Einschränkungen

- Deep Scan ist kein Compiler. Bei JS/TS läuft der TypeScript-Checker ohne Standardbibliothek, findet also z. B. Konstanten-Zuweisungen, Duplikate und Ungenutztes, aber keine Typfehler mit `Array`, `Promise` usw. Bei den heuristischen Sprachen werden nur bekannte Muster erkannt.
- Bei Syntaxfehlern in JS/TS werden tiefere Prüfungen übersprungen (das steht dann als Info im Ergebnis).
- Formatieren nur für JS, TS, JSON, CSS, SCSS, HTML, YAML.
- Aufgaben und Bugs, die vor diesem Update erledigt wurden, haben kein Erledigt-Datum. Sie zählen bei den Gesamtzahlen, fehlen aber in den Diagrammen; die Seite sagt das.
- Scratch-Code geht beim Beenden von VOID verloren (mit Warnung). Im Tray-Modus versteckt Schließen nur das Fenster, der Code bleibt.
- Der erste Deep Scan von JS/TS lädt den TypeScript-Compiler (ca. 1 MB gzip), das dauert einen Moment.
- Der Einfügen-Knopf braucht Zugriff auf die Zwischenablage; geht der nicht, hilft `Ctrl+V` im Editor.
- Die portable EXE ist um ca. 7 MB gewachsen; ihr Start hängt weiterhin vor allem am Selbstentpacken (gemessen ca. 4,3 s, schwankt mit der Festplattenlast). `VOID-App` startet in ca. 0,6 s.
