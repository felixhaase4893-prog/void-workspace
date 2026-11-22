# VOID

Ein kostenloser, local-first Workspace für Entwickler: Projekte, Aufgaben, technische Notizen und wiederverwendbare Code-Snippets an einem Ort. VOID ergänzt IDE und GitHub, es ersetzt sie nicht.

Version: **4.3.0** – Abschlussupdate der 4.x-Reihe (siehe [docs/ARCHITECTURE.md](ARCHITECTURE.md) und [docs/ROADMAP.md](ROADMAP.md)).

## Schnellstart

Voraussetzung: Node.js 20.19+ oder 22.12+.

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
```

## Skripte

| Befehl              | Zweck                                              |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Vite-Entwicklungsserver                            |
| `npm run build`     | Typecheck + Produktions-Build nach `dist/`         |
| `npm run preview`   | Gebauten Stand lokal ansehen                       |
| `npm test`          | Vitest einmalig ausführen                          |
| `npm run test:watch`| Vitest im Watch-Modus                              |
| `npm run lint`      | ESLint                                             |
| `npm run typecheck` | TypeScript ohne Ausgabe prüfen                     |
| `npm run check`     | Lint, Typecheck, Tests und Build in einem Durchlauf |
| `npm run desktop`   | VOID als Desktop-Fenster (Electron) starten        |
| `npm run desktop:build` | Windows-.exe (portable) nach `release/` bauen  |
| `npm run measure:startup` | Startzeit der gebauten EXE messen (`--exe`, `--runs`, `--empty`) |
| `npm run splash`    | `build/splash.bmp` (Startbild der portablen EXE) aus dem Icon erzeugen |

## Stack

React 19, TypeScript 6 (strict), Vite 8, Tailwind CSS 4, React Router 7, Zod 4, Lucide Icons, Vitest 5 mit Testing Library und jsdom. Schriften (Inter, JetBrains Mono) werden über Fontsource mitgebündelt, es werden keine externen Dienste geladen.

## Desktop-App (Windows .exe)

VOID läuft zusätzlich als Desktop-App über Electron (`electron/main.cjs`). Die App lädt ausschließlich die mitgelieferten Dateien über ein eigenes `app://`-Protokoll, hat keinen Node-Zugriff im Fenster (`contextIsolation`, `sandbox`) und öffnet externe Links im System-Browser. Die Daten liegen im App-Datenordner von VOID (`%APPDATA%\void`).

`npm run desktop:build` erzeugt `release/VOID-<version>-portable.exe`, die ohne Installation startet, und daneben den entpackten Ordner `release/win-unpacked/`. Die .exe ist noch nicht signiert, daher zeigt Windows SmartScreen beim ersten Start eine Warnung („Weitere Informationen → Trotzdem ausführen“).

Startzeit: Die portable EXE entpackt sich bei jedem Start in einen Temp-Ordner (rund 2 Sekunden, währenddessen erscheint das Startbild). Der entpackte Ordner (im Projekt als `VOID-App\VOID.exe`) startet ohne diesen Schritt in etwa 0,4 Sekunden. Beide nutzen dieselben Daten.

Discord Rich Presence (4.3): Läuft Discord Desktop, zeigt VOID dort einen allgemeinen Status (`Using VOID`, `Working on a project`, `testing a code`), optional mit Nutzungsdauer. Die Verbindung geht nur an die lokale Discord-App über deren IPC-Pipe (`electron/discordPresence.cjs`, ohne Zusatzpaket). Es werden nie Projektnamen, Code oder andere Inhalte übertragen. Abschaltbar unter *Settings → Discord*. Ohne Discord läuft VOID ganz normal weiter.

Fenster: Größe, Position und Maximiert-Zustand werden beim Schließen in `window-state.json` im App-Datenordner gemerkt.

Benachrichtigungen: Erinnerungen an fällige Aufgaben und kritische Bugs kommen als native Windows-Benachrichtigung, solange VOID läuft (offen, minimiert oder im Infobereich, siehe *Settings → Notifications*). Ist VOID ganz geschlossen, läuft nichts im Hintergrund; verpasste Erinnerungen erscheinen beim nächsten Start.

## Datenschutz und Daten

- Kein Konto, keine Cloud, kein Tracking. Es werden keine Daten an Server gesendet.
- Daten liegen im `localStorage` des Browsers unter dem Schlüssel `void:workspace`.
- Browserdaten werden **nicht** zwischen Geräten oder Browsern synchronisiert. Über *Settings → Export JSON* lässt sich jederzeit ein Backup herunterladen und über *Import JSON* (mit Vorschau, Zusammenführen oder Ersetzen) wieder einspielen.

## Deployment-Hinweis

VOID ist eine reine Single-Page-App. Beim Hosten (z. B. Netlify, Vercel, GitHub Pages) muss für unbekannte Pfade auf `index.html` zurückgefallen werden, damit Direktaufrufe wie `/tasks` funktionieren.
