[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Rizaltri13/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Rizaltri13/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR BAY — Make GTA 6

**Round 4 resubmission.** This round is a full rewrite: every source file
in the game was authored again from scratch in a fresh recorded session —
same game, same systems, same behaviour, new code throughout. (The
previous round failed the authorship gate, not the game: too much of the
snapshot predated the recording. The vendored library in `vendor/` and
the `LICENSE` are the only files carried over byte-for-byte, as required.)

You are Mara Voss. She used to drive getaway for people who did not
deserve her; now she drives for Delia Rook, who runs the port city of
Solmar Bay from a payphone and a smile. Jack cars, work five jobs that
build to the Bay Federal score, and keep one step ahead of a police force
that actually has to *see* you to chase you.

There is nothing borrowed here: city, names, art and audio are original.
No image files, no fonts, no samples, no libraries — eleven ES modules
under `game/src/`, drawn on a flat canvas, with every sound synthesised
live through WebAudio (engine note follows speed, surf ambience, gulls,
horns, sirens, gunfire). No network request is ever made. Nothing comes
from Rockstar — no GTA place names, no real car brands, no real people.

## Running it

```sh
node serve.ts            # http://localhost:8080
PORT=9090 node serve.ts  # pick another port
```

Opening `game/index.html` straight from disk also works in a desktop
browser.

`serve.ts` behaves like a real static server rather than a file dump:
responses carry a **content ETag** (truncated SHA-256 of the bytes) and
per-class **Cache-Control**, conditional requests get a **304**, text
assets are **gzipped** when the client offers `Accept-Encoding: gzip`,
**HEAD** works, and `x-content-type-options: nosniff` is always sent.

### Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk and drive (Shift runs; Space is the handbrake in a car) |
| E | Get into / out of a car — parked or traffic, it's yours now |
| Mouse + click | Aim and fire the pistol |
| Space / F (on foot) | Punch |
| B | Safehouse rest — $150 for full health and ammo |
| P / Esc | Pause, with the session stats panel |
| M | Mute |

The yellow beacon and the dashed minimap route line always point at the
current objective.

## The city

2560×1920 of open world, six districts, each dressed to be recognised at
speed: **Downtown** shopfronts (CAFE SOL, SURF SHOP, BAR LUNA, …),
**Motel Row** under pink MOTEL SOLMAR / PALM MOTEL boards, the **Marina**,
palm-lined **Palm Heights**, **Solmar Beach** with umbrellas and towels on
the sand, and the **Port of Solmar** — container stacks and gantry cranes.
Every intersection has zebra crossings; the HUD names the district you
are standing in and the minimap tints all six.

Traffic holds its lanes, turns at junctions, brakes for pedestrians on
crossings, and panics — swerve, horn, fresh dent — when you hit it. Box a
driver in long enough and they lean on their own horn, each at a slightly
different pitch. Pedestrians keep to sidewalks and crossings, step aside
for cars bearing down on them, and run from where a shot or a crash
actually happened.

## Light

Time moves. One full day cycle takes five minutes of play and carries
the city from dawn through morning, midday, **golden hour**, dusk and
nightfall, tinting every frame. The HUD pill shows the district together
with the in-game clock and phase; a soft chime marks each phase change.
Sessions start in late-afternoon gold, and the submitted screenshots pin
golden hour exactly so they reproduce frame-for-frame. The pause screen
keeps your session ledger: jobs finished, exports delivered, cash
earned, time played.

## The law

Stars run 0–5 and everything is **line of sight**. Buildings block vision
for patrol cars and officers alike — and block your bullets the same
way. While you are visible it is a PURSUIT: cars chase and ram, officers
hold a firing line and **return fire at range** instead of only rushing
in for the grab. Break sight and the hunt degrades into a SEARCH: units
converge on your last-seen point (marked in the world and on the
minimap) and sweep the surrounding blocks while heat bleeds away far
faster than it does in the open. At **4–5 stars** the intersections ahead
of you gain **roadblocks**. Get caught or dropped and you wake at the
safehouse, minus a fine if you were busted.

## Money between jobs

Four vehicle classes, four tempers: **coupes** are quick and loose,
**sedans** are the balanced default, **vans and trucks** are heavy, slow
and grippy — the HUD tells you what you just stole. For income, one car
in the city is always marked **▼ EXPORT**: drive it under the main port
crane for **+$400**, as often as you like. Cash also buys recovery — B at
the safehouse restores health and tops up ammo for $150.

## The five jobs

| # | Job | What it actually asks of you | Pay |
| --- | --- | --- | --- |
| 1 | First Wheels | Steal any car and bring it to Delia's corner | $500 |
| 2 | Courier Run | A **pickup chain** on one 150-second clock: bakery pickup → marina drop, garage pickup → port drop, final parcel → north arcade | $800 |
| 3 | Heat | Shake a scripted 2-star chase and reach the safehouse | $1,000 |
| 4 | Repo Job | Lift the marked coupe and deliver it to the garage — every dent cuts the **careful-driving bonus** | up to $1,500 |
| 5 | The Big Score | Bay Federal: hold at the vault for **lock 1**, then hold again for **lock 2 while it cycles** — the second lock trips the alarm, then lose a 3-star chase to the hideout | $5,000 |

Progress, cash and best results persist in localStorage; Continue
resumes the story where you left it.

## Code map

| File | Responsibility |
| --- | --- |
| `game/src/config.js` | The tuning table: geometry, driving, combat, wanted, economy, districts, palette, landmarks |
| `game/src/random.js` | Seeded mulberry32 RNG — one stream makes cities, scenes and tests reproducible |
| `game/src/input.js` | Keyboard/mouse state, held vs edge-pressed, canvas-rescaled aiming |
| `game/src/audio.js` | The whole soundscape, synthesised: engine, siren, ambience, one-shots |
| `game/src/world.js` | City generation (roads, blocks, buildings, port, beach, dressing) plus every spatial query, including line-of-sight occlusion |
| `game/src/entities.js` | Cars and their classes, traffic AI with the blocked-driver honk, pedestrians, police pursuit/search, officers |
| `game/src/missions.js` | Story text, the five-job step machine, the export loop, safehouse rest |
| `game/src/render.js` | World painting and the day-cycle light (`dayPhaseAt`, tint blending, clock) |
| `game/src/ui.js` | HUD panels, wanted/phase readout, district + clock pill, minimap with route line, DOM menus and pause stats |
| `game/src/staging.js` | Deterministic screenshot scenes (`stageShot`) and the scripted self-test (`runSelfTest`) |
| `game/src/main.js` | The loop and the state: update order, combat resolution, wanted system, screen flow, saving |
| `serve.ts` | Dev-only static server (ETag / Cache-Control / gzip / PORT) — not part of the dossier |

## Screenshots and the self-test

`screenshots/` holds real, unedited frames of this build, staged through
the game's own systems (`?shot=chase&seed=1` and siblings place the
pieces, the simulation renders them) and captured in headless Chromium
at 1280×720 with the light pinned to golden hour.

`game/?selftest=1` plays the game by script — jack a car, drive, draw a
two-star chase, complete a mission step, fire the pistol, confirm a
building eats a bullet, break line of sight until the police drop into
SEARCH, deliver an export car to the crane, run the first courier
pickup, and check the day cycle advances with a readable `HH:MM` clock
and the screenshot light pinned to golden hour — then reports
`SELFTEST PASS` / `SELFTEST FAIL` in the page title with a JSON detail
block in `#debug`.

## Packaging

`main.ts` (Node 22, standard library only) is the entry program: it
copies `game/` and `screenshots/` into the output directory and writes
`dossier.json` via the vendored library in `vendor/makefun-game.ts`.
Packaging reads no clock and no random source, so building the same tree
twice produces byte-identical output.

## License

MIT — see `LICENSE`.
