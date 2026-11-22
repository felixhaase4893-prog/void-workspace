# VOID Update 4.2 – QoL: Cleaner UI & Better Workflow

Stand: 22.11.2026. Rein lokal, keine Cloud, keine Accounts, keine neuen Abhängigkeiten. Datenformat bleibt **v5** (keine Migration nötig). App-Icon unverändert. UI bleibt Englisch.

## 1. Quick Add (Command Palette)

- **Ctrl+N** öffnet „Quick add“ zentral auf dem Bildschirm (Ctrl+K bleibt die Suche, Ctrl+Shift+D das Dev-Menü). Außerdem Button **Quick add** in der Sidebar und **+** im Handy-Header.
- Erstellt **Aufgaben, Projekte, Notizen, Snippets und Bugs**. Typ-Umschalter oben (Maus, Pfeiltasten oder **Alt+1 … Alt+5**). Was schon getippt ist, bleibt beim Umschalten erhalten.
- Nur das Nötigste: Titel, dazu je nach Typ Projekt, Priorität, Fälligkeit (Aufgabe), Typ (Projekt), Inhalt (Notiz), Sprache + Code (Snippet).
- **Enter** erstellt und schließt, **Shift+Enter** erstellt und bleibt offen für den nächsten Eintrag, **Ctrl+Enter** funktioniert auch aus mehrzeiligen Feldern, **Esc** schließt.
- **More options…** öffnet das volle Formular mit dem bereits Getippten.
- Auf einer Projektseite ist dieses Projekt vorausgewählt. Der zuletzt benutzte Typ wird für die Sitzung gemerkt.
- Validierung über dieselben Zod-Schemas wie die normalen Formulare (`src/features/quickadd/`).

## 2. Schnellnavigation

- **Ctrl+1** Dashboard, **Ctrl+2** Projekte, **Ctrl+3** Aufgaben, **Ctrl+4** Notizen, **Ctrl+5** Snippets, **Ctrl+6** Bugs, **Ctrl+7** Einstellungen. Funktioniert auch mit dem Zahlenblock und deutschem Tastaturlayout (physische Taste).
- Funktioniert auch aus einem Textfeld, aber nicht, solange ein Dialog offen ist (nichts wechselt hinter einem ungespeicherten Formular).
- Tooltips in der Navigation zeigen das Kürzel. Neuer Abschnitt **Settings → Keyboard shortcuts** listet alle Kürzel (`src/app/shortcuts.ts`, `src/app/useNavigationShortcuts.ts`).
- Geprüfte Konflikte: Ctrl+K (Suche), Ctrl+Shift+D (Dev-Menü), Esc/Enter/Pfeile in Dialogen. Electron hat kein App-Menü, Ctrl+N war frei.

## 3. Dashboard anpassen

- Button **Customize** im Dashboard: Karten (Summary, Quick actions, Due soon, Recently edited, Projects) ein-/ausblenden und mit Pfeilen nach oben/unten verschieben, **Restore default**.
- Gespeichert lokal in den Preferences (`void:preferences`, Feld `dashboard`), übersteht Neustarts. Kaputte oder alte Einträge werden repariert, neue Karten künftiger Versionen automatisch angehängt (`src/domain/dashboardLayout.ts`).
- Breite Karten (Summary, Quick actions) über die volle Breite, die anderen nebeneinander auf breiten Fenstern.
- Sind alle Karten ausgeblendet, erklärt ein Hinweis, wie man sie zurückholt.
- Quick actions enthalten jetzt auch **New bug**.

## 4. Mehrfachauswahl (Aufgaben und Bugs)

- Button **Select** auf den Seiten Tasks und Bugs. Danach Checkbox pro Zeile, Klick auf die Zeile wählt aus, **Shift+Klick** wählt einen Bereich, **Ctrl+A** alles Sichtbare, **Esc** beendet die Auswahl.
- Leiste mit Aktionen (bleibt beim Scrollen oben): Aufgaben **Mark done**, **Set priority**, **Move to project**, **Delete**; Bugs **Set status**, **Set priority**, **Move to project**, **Delete**.
- Löschen fragt vorher („Delete 3 tasks?“, Cancel ist vorausgewählt).
- **Alles rückgängig machbar:** Toast mit **Undo** (8 s, pausiert bei Hover, wie bisher). Mehrfachlöschung ist eine einzige Löschung mit einem Datensatz, ein Undo bringt alle Einträge an ihre alte Position zurück (`deleteManyWithUndo` in `src/domain/undo.ts`). Auch Status-/Prioritäts-/Projektänderungen haben Undo (`src/domain/bulk.ts`). Zwischenzeitliche andere Änderungen bleiben erhalten.
- Sicherheit: Aktionen gelten nur für Zeilen, die gerade sichtbar sind. Ein Filter kann also nie versteckte Einträge mitlöschen.

## 5. Suchverlauf

- Gemerkt wird eine Suche nur, wenn ein Ergebnis geöffnet wurde (nicht beim Tippen). Maximal 8 Einträge, ohne Duplikate (Groß-/Kleinschreibung egal), überlange Eingaben werden ignoriert.
- Bei leerem Suchfeld: **Recent searches**. Pfeiltasten + Enter setzt den Begriff ein, **×** oder **Shift+Entf** entfernt einen Eintrag, **Clear history** löscht alles.
- **Settings → Search**: Verlauf abschaltbar (löscht ihn sofort) und Button **Clear history**.
- Gespeichert getrennt von Workspace und Backups unter `void:search-history`. Suche und Gruppierung sind unverändert.

## 6. UI-Polishing

- Buttons (md) und Eingabefelder einheitlich 36 px hoch, Dropdown-Optionen dunkel.
- Kompaktere Seitenköpfe, Kartenköpfe, Dialog-Fußzeilen und Statistik-Kacheln; etwas weniger Abstand im Hauptbereich.
- Neue gemeinsame Bausteine: `ConfirmDialog`, `Kbd`.
- Kleine Fenster: Auswahlleiste und Quick Add getestet bei 420 px Breite; die Leiste bricht sauber in zwei Zeilen um.
- Keine neuen Animationen, keine Funktion entfernt oder versteckt.

## 7. Empty States und Rückmeldungen

- Leere Listen (Projekte, Aufgaben, Bugs, Notizen, Snippets) mit kurzer Erklärung, Erstellen-Button und Tipp „Ctrl N adds anything from any page“.
- Tasks-Kopf zeigt die Zahl offener Aufgaben bzw. „No open tasks. Everything on your list is done.“
- Toasts vereinheitlicht: gleiche Fläche für alle, Ton nur über Icon und farbige Kante (Text bleibt lesbar). Neuer Ton **info** (z. B. „Nothing to change“). Undo-Verhalten (8 s, Pause bei Hover/Fokus) unverändert. Dev-Menü kann den Info-Toast zeigen.

## Geänderte Dateien

Neu:
`src/app/shortcuts.ts`, `src/app/useNavigationShortcuts.ts`, `src/components/ui/ConfirmDialog.tsx`, `src/components/ui/Kbd.tsx`, `src/domain/bulk.ts`, `src/domain/dashboardLayout.ts`, `src/domain/searchHistory.ts`, `src/features/dashboard/CustomizeDashboardDialog.tsx`, `src/features/dashboard/useDashboardLayout.ts`, `src/features/quickadd/*` (5 Dateien), `src/features/search/useSearchHistory.ts`, `src/features/selection/*` (3 Dateien), `src/features/settings/SearchHistorySection.tsx`.
Tests neu: `src/app/QolUpdate.test.tsx`, `src/domain/bulk.test.ts`, `src/domain/dashboardLayout.test.ts`, `src/domain/searchHistory.test.ts`, `src/storage/preferencesQol.test.ts`.

Geändert:
`src/app/App.tsx`, `src/app/navigation.ts`, `src/components/ui/{Button,Card,Dialog,EmptyState,Field,PageHeader,ToastProvider,toastContext}`, `src/domain/undo.ts`, `src/features/bugs/{BugRow,BugsPage}.tsx`, `src/features/create/{entityDialogContext.ts,forms.tsx}`, `src/features/dashboard/{DashboardPage,QuickActions,StatTiles,WelcomePanel}.tsx`, `src/features/devtools/DevToolsDialog.tsx`, `src/features/{notes/NotesPage,projects/ProjectsPage,snippets/SnippetsPage}.tsx`, `src/features/search/SearchDialog.tsx`, `src/features/settings/SettingsPage.tsx`, `src/features/tasks/{TaskRow,TasksPage}.tsx`, `src/layouts/{AppLayout,MobileHeader,NavList,Sidebar}.tsx`, `src/state/{WorkspaceProvider.tsx,workspaceContext.ts}`, `src/storage/preferences.ts`.

## Neue Abhängigkeiten

Keine.

## Tests und Builds

- `npm run check`: Lint ok, Typecheck ok, **463 Tests grün** (vorher 413, +50; kein alter Test geändert oder gelöscht), Produktionsbuild ok.
- `npm run desktop:build`: ok. `VOID.exe` (portable, 326 MB) und `VOID-App\` aktualisiert. Starttest mit Wegwerf-Profil: VOID-App ~0,65 s bis Dashboard, portable EXE ~3,4 s (Selbstentpacken).
- Im Browser geprüft: Quick Add, Typwechsel per Alt+Zahl, Mehrfachauswahl mit Shift-Bereich, Mark done + Undo-Toast, Customize-Dialog, Handybreite 420 px.

## Bekannte Punkte

- Ctrl+K öffnet die Suche weiterhin nicht, solange ein Eingabefeld (auch eine Checkbox) den Fokus hat. Das ist das bisherige Verhalten, absichtlich nicht geändert.
- Vite meldet wie bisher, dass das Haupt-Bundle größer als 500 kB ist (Syntax-Highlighting). Kein Fehler.
- Im Browser-Entwicklungsmodus fängt der Browser Ctrl+N und Ctrl+1…7 teilweise selbst ab; in der Desktop-App funktionieren sie.
- Die Dashboard-Anordnung ist bewusst einfach (Pfeile statt Drag & Drop).
