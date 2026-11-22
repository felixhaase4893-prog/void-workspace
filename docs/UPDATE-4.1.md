# VOID Update 4.1

Stand: 22.11.2026. Rein lokal, keine Cloud, keine Accounts, kein Push-Dienst. Logo unverändert.

## 1. Fälligkeitsdaten für Aufgaben

- Optionales Feld **Due date** beim Erstellen und Bearbeiten (leer = kein Datum). Gespeichert als lokaler Kalendertag `YYYY-MM-DD`, nie als Zeitstempel. Dadurch ist „heute“ immer der Tag des Nutzers, unabhängig von UTC-Versatz und Sommerzeit (`src/domain/dueDates.ts`).
- Anzeige in der Liste als Badge: **Overdue by N days** (rot, mit rotem Rand an der Zeile), **Due today** (gelb), **Due tomorrow / Due in N days** (bis 7 Tage, Akzentfarbe), spätere Daten neutral.
- Erledigte Aufgaben sind nie überfällig; sie zeigen nur das Datum.
- Dashboard: neue Karte **Due soon** mit Overdue, Due today und Next 7 days.
- Filter **Due** (Overdue, Due today, Next 7 days, Later, No due date) und Sortierung **Due date: soonest first** (ohne Datum zuletzt). Status-, Prioritäts-, Projekt-, Tag- und Favoritenfilter funktionieren unverändert.
- „Heute“ aktualisiert sich um Mitternacht und beim Zurückkehren ins Fenster (`src/hooks/useToday.ts`).

## 2. Bug-Tracking

- Neue Seite **Bugs** in der Navigation. Felder: Titel, Beschreibung (bis 5000 Zeichen, z. B. Repro-Schritte), optionales Projekt, Status (Open, In progress, Fixed, Closed), Priorität (Low, Medium, High, Critical), Erstelldatum, optionales Fälligkeitsdatum, Tags, Favorit.
- Erstellen, Bearbeiten, Löschen (mit Undo), Status direkt in der Zeile ändern. Fixed/Closed bleiben sichtbar.
- Filter nach Status, Priorität, Fälligkeit, Projekt, Tags; Sortierung nach Name, Erstelldatum, Priorität, Status, Fälligkeit; Textsuche und globale Suche (`Ctrl+K`) finden Bugs.
- Projektseite zeigt die Bugs des Projekts mit „Add bug“. Dashboard-Kachel **Open bugs**.

## 3. Desktop-Benachrichtigungen

**So funktioniert es:**

- Die Seite prüft beim Start (nach 4 s, damit der Start nicht leidet), danach jede Minute und kurz nach jeder Änderung, welche Erinnerungen fällig sind (`src/domain/reminders.ts`, `src/features/notifications/ReminderScheduler.tsx`).
- Erinnert wird an: überfällige Aufgaben/Bugs, heute fällige, bald fällige (einstellbar: 1, 2, 3 Tage oder 1 Woche vorher, oder aus) und einmal an jeden offenen **kritischen** Bug.
- Die Anzeige läuft über eine schmale Brücke (`electron/preload.cjs`) zum Hauptprozess, der eine native Windows-Benachrichtigung zeigt. Klick darauf holt VOID nach vorn. Die Brücke nimmt nur Aufrufe der mitgelieferten Seite an; das Fenster hat weiter keinen Node-Zugriff.
- Keine Duplikate: Jede Erinnerung hat einen festen Schlüssel (`today:task:<id>:<datum>`). Gesendete Schlüssel stehen lokal in `void:reminders-sent` und werden vor dem Senden gespeichert. Ein Neustart zeigt also nichts doppelt. Ändert sich die Lage (neues Datum, morgen wird „heute fällig“ zu „überfällig“), gibt es genau eine neue Erinnerung.
- Erledigte Aufgaben und Fixed/Closed-Bugs erinnern nie. Elemente, die nach der heutigen Erinnerungszeit erstellt oder bearbeitet wurden, werden heute nicht mehr erinnert (man hat sie ja gerade gesehen).
- Mehr als 3 Erinnerungen auf einmal werden zu einer Sammelmeldung zusammengefasst.
- **Settings → Notifications:** alles an/aus, Aufgaben-Erinnerungen, Bug-Erinnerungen, Erinnerungszeit (Standard 09:00), frühe Erinnerung, Infobereich-Modus. Gespeichert lokal unter `void:preferences`, getrennt von den Arbeitsdaten.

**Grenzen (ehrlich):**

- Erinnerungen kommen nur, solange VOID läuft: offen, minimiert oder im Infobereich. Ist VOID ganz geschlossen, läuft nichts im Hintergrund und es wird nichts angezeigt. Verpasste Erinnerungen kommen beim nächsten Start (einmal).
- Optionaler **Infobereich-Modus** („Keep running in the notification area“, Standard aus): Das Schließen des Fensters versteckt VOID neben der Uhr; Beenden über das Tray-Menü „Quit VOID“. Wird der Modus ausgeschaltet, kommt ein verstecktes Fenster sofort zurück.
- Im Hintergrund kann Windows/Chromium Timer drosseln; eine Erinnerung kann dann bis etwa eine Minute später kommen.
- Wenn Windows Benachrichtigungen für VOID blockiert (Fokus-Assistent, Einstellungen), zeigt das Dev-Menü beim Test einen Hinweis. Die portable EXE ist nicht installiert; die App-ID ist gesetzt, die Darstellung kann trotzdem je nach Windows-Version abweichen.
- Im Browser (nicht Desktop) werden Erinnerungen nur gezeigt, wenn der Browser Benachrichtigungen bereits erlaubt. Sonst werden sie auch nicht als „gesendet“ verbucht, gehen also nicht verloren.

## 4. Entwickler-Menü

- Öffnen mit **Ctrl+Shift+D** oder **Settings → Developer → Developer tools**. Wird erst beim Öffnen geladen (eigener 8-kB-Chunk), kostet beim Start also nichts.
- **Test notifications:** Task reminder, Overdue task, Critical bug (gehen sofort raus, auch wenn Erinnerungen aus sind).
- **Test data:** „Generate test data“ legt ein Projekt mit 6 Aufgaben (überfällig, heute, morgen, in einer Woche, erledigt, ohne Datum), 5 Bugs (u. a. kritisch, fixed, closed), 2 Notizen und 2 Snippets an.
- **Due dates:** je eine Testaufgabe Due today, Due tomorrow, Overdue, Due in 7 days.
- **UI messages:** Success-, Warning-, Error- und Undo-Toast (ändern nichts).

**Testdaten entfernen:** Alles aus dem Dev-Menü hat eine ID mit `devtest-` und den Titel-Präfix `[Test] `. „Remove test data“ fragt nach („Remove N test items“ / Cancel) und löscht ausschließlich Elemente mit `devtest-`-ID. Echte Elemente bleiben exakt erhalten; hat man ein echtes Element in das Testprojekt verschoben, bleibt es erhalten und verliert nur die Projektzuordnung. Das Menü hat keine andere Lösch- oder Änderungsfunktion.

## 5. Startzeit

**Analyse** (Messskript `npm run measure:startup`, eigenes Wegwerf-Profil, Beispieldaten mit 15 Projekten, 250 Aufgaben, 80 Notizen, 80 Snippets; Messpunkte aus Hauptprozess und Seite):

- Die portable EXE entpackt sich bei **jedem** Start komplett in einen Temp-Ordner und löscht ihn beim Beenden (Vorlage von electron-builder). Das waren rund **6,6 s von 6,9 s**. Electron-Start, React und Datenladen zusammen nur ca. 0,4 s.
- Das Paket enthielt unnötig 54 MB `node_modules` (Entwicklungsabhängigkeiten) und 49 MB Chromium-Sprachdateien.
- Das Fenster wurde erst nach dem fertigen Dashboard eingeblendet.

**Maßnahmen:**

- `node_modules` aus dem Paket ausgeschlossen (die App braucht zur Laufzeit keine), app.asar 54 MB → 1 MB.
- Nur noch Sprachdateien en-US und de.
- Portable EXE ohne Kompression (`compression: store`): Entpacken ist reines Kopieren statt Dekomprimieren. Die Datei wird dafür größer (115 MB → 326 MB).
- Startbild während des Entpackens (`build/splash.bmp`, aus dem bestehenden Icon erzeugt, `npm run splash`).
- Fenster sofort sichtbar mit leichtem Ladebildschirm („Starting VOID…“) direkt aus `index.html`.

**Ergebnis (Median aus 5 Starts nach dem ersten):**

| | Vorher | Nachher |
|---|---|---|
| Portable: Prozess startet | 6,6 s | 2,3 s |
| Portable: Fenster sichtbar | ca. 7,0–7,5 s (erst nach Dashboard) | 2,4 s (Startbild schon ab Doppelklick) |
| Portable: Bedienbar / Dashboard geladen | 6,9 s | 2,6 s |
| Entpackt (`VOID-App\VOID.exe`): Fenster sichtbar | ca. 0,53 s | 0,17 s |
| Entpackt: Bedienbar / Dashboard geladen | 0,41 s | 0,37 s |

Bewusst **nicht** gemacht: Lazy-Loading der Seiten bzw. des Syntax-Highlightings. Der gesamte Renderer braucht ca. 0,2 s; der mögliche Gewinn läge bei einigen zehn Millisekunden, also unter 2 % des portablen Starts, und hätte die bestehenden Highlighting-Tests auf asynchron umstellen müssen. Kein messbarer Nutzen, also kein Umbau.

**Empfehlung:** Für den schnellsten Start `VOID-App\VOID.exe` nutzen (Verknüpfung auf den Desktop). Die portable EXE bleibt für „eine Datei zum Mitnehmen“.

## 6. UI-Feinschliff

- Einheitliche Farben für Priorität und Status bei Aufgaben und Bugs (`src/features/shared/tones.ts`), Fälligkeits-Badges überall gleich.
- Neuer Toast-Typ „warning“. Dashboard-Kacheln auf 5 erweitert, sauberer Umbruch bei schmalen Fenstern; Bugs-Seite und Einstellungen auf Handybreite geprüft.
- Einstiegs-Animation des Dashboards entfernt. Alle neuen Texte englisch. „Geplant“-Hinweis auf der Tasks-Seite nennt nur noch die Board-Ansicht.

## 7. Daten

- Datenformat **v5**: Aufgaben bekommen `dueDate` (bestehende: `null`), neue Liste `bugs` (leer). Migration 4 → 5 läuft automatisch beim Laden und schreibt v5 zurück; alle älteren Formate laufen über die Kette bis v5. Nichts geht verloren.
- Ein kaputtes gespeichertes Datum wird zu „kein Datum“, statt das Laden zu verhindern.
- Export/Import/Backup enthalten Bugs und Fälligkeitsdaten; Import zusammenführen/ersetzen kennt Bugs; ein Backup aus 4.0 (v4) lässt sich importieren.
- Rückwärts: Eine ältere VOID-Version (4.0) lehnt v5-Daten mit klarer Meldung ab und verändert sie nicht. Backup vor dem Update: `Desktop\VOID-backup-2026-11-22-vor-4.1`.

## 8. Tests und Build

- 413 Tests in 28 Dateien grün (vorher 327). Neu: Fälligkeiten inkl. Sommerzeit/Schaltjahr, Bugs (CRUD, Filter, Sortierung, Suche, Undo, Projekt löschen), Migration v4→v5 und v1→v5, Import/Export, Erinnerungslogik (Duplikate, ausgeschaltet, erledigt, Uhrzeit, Sammelmeldung, Log), Einstellungen, Testdaten (anlegen, entfernen, echte Daten unverändert), Dev-Menü und Erinnerungen in der App, Paketkonfiguration und Brücke.
- Bestehende Tests nicht gelöscht oder abgeschwächt. Angepasst wurden nur Erwartungen, die das neue Format betreffen (Version 5, zusätzliche Zählung `bug: 0` bzw. Zeile `bugs` in Import-Analysen).
- Lint, Typecheck, Produktions-Build sauber. `npm run desktop:build` erfolgreich; `VOID.exe` im Projekt ersetzt, zusätzlich `VOID-App\` (entpackt).
