# PC Optimizer – Phases A to C (Safe Optimization Preview)

As of 2026-11-28. Read-only scan, preview, selection, validation, confirmation and dry run. **No system changes are made.** The optimizer UI, its texts and this document are in English, like the rest of VOID.

## Architecture

| Layer | Location | Job |
| --- | --- | --- |
| Domain (pure, no Node) | `src/domain/optimizer/` | Zod models, action catalog, size calculation, safety classification, recommendation engine, preview builder, validation, dry run, `OptimizerService` (the 7 API functions), findings, resource summary, simulated data |
| Backend (Electron main) | `src/desktop/optimizer/` | ProcessScanner, StartupScanner, TempFileScanner, SystemScanner, read-only queries, `backend.ts` (incl. `resolveOpenTarget`) |
| Bundle | `vite.desktop.config.ts` → `electron/generated/optimizerBackend.cjs` | loaded by `main.cjs` on first use (`npm run build:desktop-backend`, part of `build`, `check`, `desktop`, `desktop:build`) |
| IPC | `electron/main.cjs`, `electron/preload.cjs` | 7 API channels `void:optimizer-*` plus `void:optimizer-open-target`; `fromApp` senders only; ids only |
| UI | `src/features/optimizer/` | page `/optimizer` (sidebar "PC Optimizer", lazy-loaded), confirmation dialog, dry-run report, deep-scan sections; demo mode with simulated data in the browser |

API: `startScan(mode?)`, `createPreview(scanId)`, `updateSelection(previewId, selectedIds)`, `validatePreview(previewId)`, `confirmPreview(previewId)`, `executeDryRun(previewId)`, `getHistory()`.

Dry-run report message: "Simulation complete – no system changes were made."

## Safety mechanisms

- Scanners only get `ReadOnlyFs` (`readdir`, `lstat`, `realpath`); writing or deleting is not reachable.
- Five fixed PowerShell queries (`processes`, `processes-deep`, `startup`, `system`, `system-deep`): only `Get-*`, CIM reads and `powercfg /getactivescheme`, run via `execFile` without a shell, absolute path to `powershell.exe`, `-EncodedCommand`, no elevation.
- Fixed temp roots inside `%LOCALAPPDATA%`; a root must not be a link; links/junctions are never followed; path containment is checked (also after `realpath`); files younger than 24 h are skipped; file and depth limits.
- The page never receives paths of cleanup candidates, only counts, sizes and sample file names. It can only send ids the backend handed out (Zod-checked, max. 500).
- `blocked` (Windows core, security software, services in session 0) is never selectable or executable; `selectedByDefault` only for `safe`.
- Confirmation only after a valid validation (max. 2 min old, same selection); the dry run validates again right before, against a fresh partial scan; previews expire after 10 min.
- `ExecutionResult` only allows `mode: 'dry-run'` and `systemChanges: 0` by schema; the change journal stays empty.

## Deep scan (`startScan('deep')`)

- A second scan type next to the quick scan; the page offers both. Unknown modes are rejected with `invalid-input`.
- `processes-deep` measures CPU, GPU engines, I/O rate and TCP connections per process over about 1.5 s from raw performance classes (language-independent, no admin rights). `system-deep` adds network throughput. The measuring PowerShell itself is left out. On the developer PC the deep scan takes about 6–14 s.
- Extra cleanup locations, all inside `%LOCALAPPDATA%` with the same protections: Windows error reports (`Microsoft\Windows\WER`) and only the cache folder of Chrome/Edge profiles (`Default`, `Profile N`, `Guest Profile`; linked profiles are skipped). Bookmarks, passwords and history are never touched.
- **Performance hogs** (`findings`): heavy programs, many startup entries, an almost full drive, memory pressure, long uptime without a restart, power saver mode, lots of junk files. Each shows severity, the measured value, the cause and numbered steps to fix it yourself, plus "Open" and "Go to action".
- **"What uses the most performance?"** (`resources`): top 5 for CPU, GPU, RAM and network, and an overall ranking (processes grouped per program; score = CPU % + GPU % + RAM share + I/O share).
- Honest note: Windows does not measure network traffic per program without admin rights. Per program, VOID shows the I/O rate (disk + network) and the number of TCP connections. The totals (↓/↑) are real network values.

## One-click open

- IPC channel `void:optimizer-open-target`. The page only sends a fixed target id (`folder:user-temp|crash-dumps|error-reports|startup-user|startup-common`, `settings:startup-apps|storage|power|apps`, `app:task-manager`, `drive:X:`), never a path.
- `resolveOpenTarget` in the backend maps the id to a folder, an `ms-settings:` page or `Taskmgr.exe`; anything else returns `null`. `main.cjs` only opens `ms-settings:[a-z]+` via `shell.openExternal` and only existing paths via `shell.openPath`.
- Buttons on recommendations, performance hogs, drives and in the system overview. They are disabled in the browser demo.
- Every recommendation has "How to do it yourself" (manual steps) in its details.

## Tests

85 optimizer tests (`src/domain/optimizer/optimizer.test.ts`, `src/desktop/optimizer/desktopOptimizer.test.ts`, `src/features/optimizer/OptimizerPage.test.tsx`), including real temp files with a junction pointing outside (not followed, nothing changed), no `fs` write functions, no `process.kill`, only the fixed queries, a source scan for forbidden APIs, identical IPC channels in backend/main/preload, deep-scan findings and ranking, `resolveOpenTarget` rejecting paths, commands and unknown ids, and UI flows for both scan types. Total: 671 tests green.

## Open (later phases)

- Real execution of the actions, including the change journal and undo.
- Admin actions (HKLM startup) will need an elevation concept.
- The quick scan's CPU load is a 0.5 s sample; hidden files are treated like normal temp files; "in use" is approximated by age (24 h), not by file locks.
- Simulation history lives in memory only (lost on exit).
- GPU values only exist when the graphics driver provides GPU performance counters; otherwise the card shows "Not measurable".
- I/O values per process name are occasionally doubled when Windows merges several instances with the same name.
- Firefox caches are not measured yet.
