// Measures how long VOID takes to start, from launching the EXE to a usable dashboard.
//
//   npm run measure:startup                      # latest portable EXE in release/, sample data, 6 launches
//   node scripts/measure-startup.mjs --exe release/win-unpacked/VOID.exe --runs 8 --empty
//
// Every launch uses a throwaway profile folder, so the real workspace is never read or changed.
// The EXE writes timestamps to a trace file only because VOID_STARTUP_TRACE is set (see electron/startupTrace.cjs).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const flag = (name) => args.includes(`--${name}`);

function defaultExe() {
  const release = path.resolve('release');
  const portable = fs.readdirSync(release).find((name) => /portable\.exe$/i.test(name));
  if (!portable) throw new Error('No portable EXE in release/. Run npm run desktop:build first.');
  return path.join(release, portable);
}

const exe = path.resolve(option('exe', '') || defaultExe());
const runs = Number(option('runs', '6'));
const empty = flag('empty');
const label = option('label', path.basename(exe));
const output = option('json', '');

/** A plausible, fairly busy workspace in data format v4 (newer builds migrate it on first launch). */
function sampleWorkspace() {
  const iso = (offsetMinutes) => new Date(Date.UTC(2026, 9, 1) + offsetMinutes * 60_000).toISOString();
  const id = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;
  const tags = Array.from({ length: 20 }, (_, n) => ({ id: id('tag', n), name: `Tag ${n}`, color: null, createdAt: iso(n), updatedAt: iso(n) }));
  const projects = Array.from({ length: 15 }, (_, n) => ({
    id: id('project', n), name: `Project ${n}`, description: 'A sample project used for startup measurements.', kind: 'web', status: 'active',
    technologies: ['React', 'TypeScript'], links: [], tagIds: [tags[n % 20].id], favorite: n % 5 === 0, createdAt: iso(n * 10), updatedAt: iso(n * 10 + 5),
  }));
  const tasks = Array.from({ length: 250 }, (_, n) => ({
    id: id('task', n), title: `Task ${n}: implement something useful`, description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'.repeat(2),
    projectId: projects[n % 15].id, status: ['todo', 'in_progress', 'done'][n % 3], priority: ['low', 'medium', 'high'][n % 3],
    tagIds: [tags[n % 20].id], favorite: n % 17 === 0, createdAt: iso(200 + n), updatedAt: iso(400 + n),
  }));
  const markdown = '# Heading\n\nSome **bold** text, a [link](https://example.com) and `code`.\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n'.repeat(12);
  const notes = Array.from({ length: 80 }, (_, n) => ({
    id: id('note', n), title: `Note ${n}`, content: markdown, projectId: projects[n % 15].id, tagIds: [], favorite: false, createdAt: iso(700 + n), updatedAt: iso(800 + n),
  }));
  const code = 'export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number) {\n  let timer: ReturnType<typeof setTimeout>;\n  return (...args: Parameters<T>) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}\n'.repeat(4);
  const snippets = Array.from({ length: 80 }, (_, n) => ({
    id: id('snippet', n), title: `Snippet ${n}`, language: ['TypeScript', 'Lua', 'Python', 'C#'][n % 4], code, description: 'Sample', projectId: null, tagIds: [], favorite: false,
    createdAt: iso(900 + n), updatedAt: iso(1000 + n),
  }));
  return { schemaVersion: 4, projects, tasks, notes, snippets, tags };
}

function launch(env, untilMark, timeoutMs = 90_000) {
  const traceFile = path.join(os.tmpdir(), `void-trace-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(traceFile, '');
  const startedAt = Date.now();
  const child = spawn(exe, [], { env: { ...process.env, ...env, VOID_STARTUP_TRACE: traceFile }, stdio: 'ignore', windowsHide: false });
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const text = fs.readFileSync(traceFile, 'utf8');
      const marks = Object.fromEntries(text.trim().split('\n').filter(Boolean).map((line) => line.split(' ')).map(([name, at]) => [name, Number(at) - startedAt]));
      if (untilMark in marks) {
        clearInterval(timer);
        child.once('exit', () => {
          fs.rmSync(traceFile, { force: true });
          resolve(marks);
        });
      } else if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']);
        reject(new Error(`Timed out waiting for "${untilMark}". Trace so far:\n${text}`));
      }
    }, 25);
  });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'void-startup-profile-'));
const baseEnv = { VOID_USER_DATA_DIR: profile };

console.log(`Measuring ${label}`);
console.log(`  EXE: ${exe}`);
console.log(`  Data: ${empty ? 'empty workspace' : 'sample workspace (15 projects, 250 tasks, 80 notes, 80 snippets)'}`);

if (!empty) {
  const seedFile = path.join(profile, 'seed.json');
  fs.writeFileSync(seedFile, JSON.stringify(sampleWorkspace()));
  await launch({ ...baseEnv, VOID_TRACE_SEED: seedFile }, 'seeded');
}

const METRICS = [
  ['Process start (main.cjs runs)', 'main-start'],
  ['Visible window', 'window-shown'],
  ['Interactive UI', 'renderer-interactive'],
  ['Dashboard loaded', 'renderer-dashboard-ready'],
];

const results = [];
for (let run = 0; run < runs; run += 1) {
  const marks = await launch({ ...baseEnv, VOID_TRACE_EXIT: '1' }, 'done');
  results.push(marks);
  console.log(`  run ${run + 1}: ${METRICS.map(([, key]) => `${key}=${marks[key]}ms`).join('  ')}`);
}

// The first launch includes cold caches; the median of the others is the steady-state figure.
const steady = results.length > 1 ? results.slice(1) : results;
const summary = Object.fromEntries(METRICS.map(([name, key]) => [name, { first: results[0][key], median: median(steady.map((marks) => marks[key])) }]));
console.log('\n  Metric                          first run   median (runs 2+)');
for (const [name, value] of Object.entries(summary)) console.log(`  ${name.padEnd(32)}${String(value.first).padStart(6)} ms   ${String(value.median).padStart(6)} ms`);

if (output) fs.writeFileSync(output, JSON.stringify({ label, exe, empty, runs: results, summary }, null, 2));
fs.rmSync(profile, { recursive: true, force: true });
