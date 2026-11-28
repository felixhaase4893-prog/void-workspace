<p align="center">
  <img src="build/icon.png" alt="VOID logo" width="96" height="96">
</p>

<h1 align="center">VOID</h1>

<p align="center">
  A free, <b>local-first</b> workspace for developers.<br>
  Projects, tasks, bugs, notes and code snippets in one fast desktop app. No account, no cloud, no tracking.
</p>

<p align="center">
  <a href="../../releases/latest"><b>Download for Windows</b></a>
</p>

---

VOID sits next to your IDE and GitHub, not in place of them. It is the place for the stuff that usually ends up scattered across sticky notes, random text files and browser tabs: what you are working on, what is broken, what you still need to do, and that one snippet you always have to look up again.

## Features

- **Projects** with status, technologies, links and a project overview (progress, open tasks, bugs).
- **Tasks** with priority, status and due dates, plus reminders as native Windows notifications.
- **Bug tracker** with severity, status and resolution tracking.
- **Markdown notes** with a live preview (own safe parser, no raw HTML).
- **Code snippets** with syntax highlighting for many languages.
- **Code Tester**: a CodeMirror editor that checks JS/TS/JSON/CSS/SCSS/HTML/YAML/Python and more for errors and formats code with Prettier. It never executes your code.
- **Statistics** page and a customizable **dashboard**.
- **Global search** (`Ctrl+K`), **Quick Add** (`Ctrl+N`), tags, favorites, filters and sorting.
- **Multi-select** and bulk actions, with **Undo** after deleting.
- **Backup**: export everything as JSON and import it again (merge or replace, with preview).
- **Discord Rich Presence** (optional): shows a generic status like "Working on a project". Project names or code are never sent.
- **PC Optimizer** (desktop app): a read-only quick scan or deep scan of your PC. It shows which programs use the most CPU, GPU, RAM and network, lists performance hogs with step-by-step fixes, and opens the right folder or Windows settings page in one click. In this version every action is only simulated – nothing on your PC is changed.
- **4 languages**: English, Español, 简体中文 and Deutsch. VOID picks your system language on first start; switch any time in **Settings → Language**. Your own content is never translated.
- Keyboard-first: `Ctrl+1` to `Ctrl+9` jump between pages.

## Download

Grab `VOID-<version>-portable.exe` from the [latest release](../../releases/latest) and run it. No installation needed.

> The exe is not code-signed yet, so Windows SmartScreen may warn you on first launch. Click **More info → Run anyway**.

## Privacy

VOID is local-first by design:

- No account, no login, no server, no telemetry.
- Your data stays on your machine (in the app's data folder, `%APPDATA%\void`).
- Nothing is synced. Use **Settings → Export JSON** for backups.
- The only optional network-ish feature is Discord Rich Presence, which talks to the Discord app on your own PC through a local pipe and can be turned off in Settings.
- The PC Optimizer only reads (processes, startup entries, temp folders, system info) through a fixed set of read-only Windows queries. It never deletes files, ends processes, edits the registry or asks for admin rights, and its results never leave your PC.

## Build from source

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev            # web version on http://localhost:5173
npm run desktop        # run as Electron desktop app
npm run desktop:build  # build the portable Windows exe into release/
npm run check          # lint, typecheck, tests and build
```

## Tech stack

React 19, TypeScript (strict), Vite, Tailwind CSS 4, React Router, Zod, CodeMirror 6, Electron, Vitest + Testing Library. Fonts are bundled, no external services are loaded at runtime.

The Electron window runs with `contextIsolation` and `sandbox`, loads only bundled files through its own `app://` protocol and opens external links in your system browser.

## Docs

Architecture notes, the roadmap and changelogs per update live in [`docs/`](docs) (mostly German). A German version of this README is at [`docs/README.de.md`](docs/README.de.md).
