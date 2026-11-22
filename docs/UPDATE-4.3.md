# VOID Update 4.3 – Abschlussupdate der 4.x-Reihe

Stand: 22.11.2026 · Version 4.3.0 · Datenformat weiterhin v5 · keine neuen Abhängigkeiten

## 1. Implementierte Funktionen

- Discord Rich Presence (Abschnitt 2)
- Fenstergröße, -position und Maximiert-Zustand werden gemerkt
- Jede Seite startet oben (vorher blieb die Scrollposition der vorigen Seite stehen)
- Code Tester und Statistik werden 3 s nach dem Start im Leerlauf vorgeladen, `Ctrl+8`/`Ctrl+9` öffnen ohne Ladekreis
- *Settings → Storage* zeigt die VOID-Version (aus `package.json`)
- Einheitliche Schalter für alle An/Aus-Einstellungen (Suchverlauf war eine einfache Checkbox), Schalter als gemeinsame Komponente `components/ui/Toggle.tsx`
- Verschachtelte Dialoge: Escape und Tab wirken nur auf den obersten Dialog, Seiten-Scrollsperre erst nach dem letzten gelöst

## 2. Discord-Integration

- Status exakt: `Using VOID` (Standard), `Working on a project` (Projekte und Projekt-Detailseite), `testing a code` (Code Tester). Als „Playing VOID“ mit Logo `void_logo` (falls im Developer Portal hochgeladen).
- Application ID `1574062836974358668` in `electron/discordConfig.cjs`.
- *Settings → Discord*: Rich Presence an/aus (Standard an), „Show time used“ (Discord zählt selbst ab dem Start von VOID, daher zuverlässig), Verbindungsstatus (Connected, Connecting…, Discord not running mit „Retry now“, Not accepted, Off, Desktop app only), aktuell gezeigte Zeile und die Liste der drei möglichen Zeilen. Lokal gespeichert in `void:preferences`.
- Technik: eigenes, abhängigkeitsfreies Modul im Main-Prozess (`electron/discordPresence.cjs`), spricht direkt mit der lokalen Discord-App. Keine Cloud, kein eigener Server, keine Hintergrundprozesse, nur ein Timer für Wiederverbindung.
- Privatsphäre: Über die Brücke gehen nur zwei Schalter und einer von drei festen Namen. Die Texte liegen in der Shell. Ein Test prüft jede an Discord geschriebene Zeichenkette gegen eine Positivliste.
- Robustheit: Discord nicht gestartet oder geschlossen → leise Wiederholung (15 s, 30 s, dann minütlich), keine Fehlermeldungsflut, kein Absturz. Ungültige ID → einmal „Not accepted“, keine Wiederholung. Schnelle Seitenwechsel werden gebündelt, Wiederholungen unterdrückt (Discord-Ratenlimit). Beim Abschalten und Beenden wird der Status gelöscht.

## 3. QoL-Verbesserungen

Siehe Abschnitt 1. Bewusst klein gehalten: nichts an gut funktionierenden Seiten umgebaut.

## 4. Bugfixes

- Scrollposition wurde beim Seitenwechsel übernommen (z. B. unten in Settings → Tasks landet mitten in der Liste).
- Zwei offene Dialoge hätten bei Escape beide reagiert (der äußere zuerst) und die Scrollsperre zu früh gelöst.
- Uneinheitliche Bedienelemente in den Einstellungen (Checkbox vs. Schalter).

Geprüft ohne Befund: alle Seiten bei 380 px Mindestbreite ohne horizontales Überlaufen (nur Codeblöcke scrollen in sich, gewollt), Navigation und Shortcuts, Toasts.

## 5. Performance

- Discord-Modul wird erst nach dem ersten Seitenaufbau geladen, Verbindung startet nach dem Rendern: kein Einfluss auf die Startzeit.
- Vorladen der großen Seiten erst 3 s nach dem Start und im Leerlauf.
- Gemessen (`npm run measure:startup`, je 3 Starts, Median): portable `VOID.exe` 3,7 s bis bedienbar (4.2: ca. 4,3 s, schwankt mit Festplattenlast), `VOID-App\VOID.exe` 0,54 s.

## 6. Test-Ergebnisse

- Vitest: **42 Dateien, 586 Tests, alle grün** (vorher 549). Neu: `src/app/DiscordPresence.test.ts` (21, Protokoll, Statuswechsel, Discord fehlt/geschlossen, falsche ID, kaputte Frames, Privatsphäre), `src/app/Discord.test.tsx` (9, Seite und Einstellungen), `src/app/Update43.test.tsx` (6). Angepasst: Packaging-, QoL- und 4.1-Tests (neue Bridge-Kanäle, Schalter statt Checkbox).
- Bestehende Tests für Projekte, Aufgaben, Bugs, Notizen, Snippets, Code Tester, Formatter, Projektübersicht, Statistik, Settings, Export/Import, Backup/Wiederherstellung laufen unverändert mit.
- TypeScript (`tsc --noEmit`) und ESLint: keine Fehler.
- Manuell in der gebauten App (eigenes Testprofil, über das Debug-Protokoll gesteuert): Start, echte Discord-Verbindung „Connected“, Wechsel auf alle drei Status, Ab- und Anschalten, Einstellungen gespeichert und nach Neuladen erhalten, Version 4.3.0 sichtbar. Mit unbekannter Application ID: „Not accepted“, App läuft normal weiter. Fenstergröße beim Schließen gespeichert und beim nächsten Start wiederhergestellt.

## 7. Build-Ergebnisse

- `npm run check` (Lint, Typecheck, Tests, Vite-Build): erfolgreich.
- `npm run desktop:build`: erfolgreich, `release/VOID-4.3.0-portable.exe` (ca. 318 MB). Hinweis „chunk size“ von Vite wie bisher (TypeScript-Compiler für den Deep Scan, wird nur bei Bedarf geladen).

## 8. Speicherort der EXE

- `VOID.exe` (portable)
- `VOID-App\VOID.exe` (entpackt, startet am schnellsten)
- Original: `release\VOID-4.3.0-portable.exe`

## 9. Bekannte Einschränkungen

- Rich Presence braucht die Discord-Desktop-App auf demselben PC (nicht Browser-Discord) und in Discord die Einstellung „Aktivitätsstatus teilen“.
- Das Logo erscheint nur, wenn im Developer Portal ein Art Asset `void_logo` hochgeladen ist; ohne Asset zeigt Discord den Status ohne Bild.
- Der Fall „Discord wird während VOID läuft geschlossen“ ist automatisiert getestet, aber nicht von Hand am echten Discord, weil dafür Discord auf dem PC hätte beendet werden müssen.
- Ob Discord den Status sichtbar anzeigt, wurde über die Verbindungsbestätigung (READY) geprüft, nicht per Blick ins Discord-Profil.
- „Testing a code“ hängt an der geöffneten Code-Tester-Seite, nicht daran, ob gerade getippt wird.
- Im Browser (`npm run dev`) gibt es keine Rich Presence; die Einstellungen sagen das.
- Weiterhin aus 4.2: Deep Scan ist kein Compiler, portable EXE entpackt sich bei jedem Start.
