// SOLMAR BAY — the gta6-01 entry program (Node 22, standard library only).
// The game itself is the static files under game/: index.html plus its ES
// modules, no library and no network request. This program copies game/ and
// screenshots/ into the output directory and writes dossier.json with the
// vendored make.fun library, exactly the summary the judge reads.
//
// Quality resubmission: recognisable coastal districts (downtown signs,
// Motel Row, marina, beach umbrellas, port cranes), line-of-sight police
// pursuit with a SEARCH phase and 4–5-star roadblocks, distinct mission
// mechanics (courier pickup chain, repo careful-driving bonus, two-lock
// bank vault), vehicle classes, a repeatable port vehicle-export loop,
// building-occluded gunfire, and screenshot/self-test staging split into
// game/src/staging.js. The dossier inputs stay deterministic: no clock,
// no randomness — the same tree always produces the same dossier.json.
//
// v3 polish pass: a slow day-cycle light (dawn → golden hour → dusk →
// nightfall) driven by game time with a HUD clock, traffic drivers who
// honk when blocked, and a pause-screen session stats panel. serve.ts
// was upgraded alongside (ETag / Cache-Control / gzip / PORT) — it is a
// dev-only server and is not part of this dossier.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
// Fail loudly instead of shipping a hollow dossier if the tree is wrong.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — refusing to build a dossier without the game');
}
// game/ ships whole: index.html + src/{config,random,input,audio,world,
// entities,missions,render,ui,staging,main}.js — all static, all offline.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
