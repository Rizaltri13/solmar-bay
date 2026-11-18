// main.ts — the SOLMAR BAY entry program for gta6-01 (round 4 rewrite).
//
// The game is a folder of static files: game/index.html plus its ES
// modules. This program's whole job is packaging — copy game/ and
// screenshots/ into the output directory, then ask the vendored make.fun
// library to summarise that tree as dossier.json.
//
// Packaging is deterministic by construction: nothing here reads a clock
// or a random source, so the same source tree always yields byte-identical
// dossier output. (Verified during this round by building twice and
// comparing with cmp.)
//
// What is inside the game, briefly: six dressed coastal districts, a
// line-of-sight wanted system with a SEARCH phase and high-star
// roadblocks, five story jobs with genuinely different mechanics (a
// courier pickup chain, a repo run with a careful-driving bonus, a
// two-lock bank vault), four vehicle classes, a repeatable port export
// loop, building-occluded gunfire, a drifting day cycle, and the
// screenshot/self-test staging in game/src/staging.js.
//
// Local play:  node serve.ts  →  http://localhost:8080
// Local build: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Refuse to package a tree that is missing the game itself — a hollow
// dossier would waste a judging slot and say nothing useful.
const gameIndex = join(sourceRoot, 'game', 'index.html');
if (!existsSync(gameIndex)) {
  throw new Error('game/index.html is missing — refusing to build a dossier without the game');
}

mkdirSync(outputDir, { recursive: true });
cpSync(join(sourceRoot, 'game'), join(outputDir, 'game'), { recursive: true });

mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const screenshotSource = join(sourceRoot, 'screenshots');
if (existsSync(screenshotSource)) {
  cpSync(screenshotSource, join(outputDir, 'screenshots'), { recursive: true });
}

// The limits below mirror the scorer's gate: text_max_bytes shapes the
// dossier bytes, the rest make this program refuse exactly what the
// scorer would refuse (screenshot count/size, game file count/size, and
// the per-path length cap).
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const dossierBytes = buildDossier(outputDir, DOSSIER_LIMITS);
writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);
console.log(`SOLMAR BAY packaged → ${join(outputDir, 'dossier.json')} (${dossierBytes.length} bytes)`);
