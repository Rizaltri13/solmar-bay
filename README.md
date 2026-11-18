[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Rizaltri13/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Rizaltri13/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR BAY — Make GTA 6

An original open-world crime game in the spirit of GTA 6, in pure static
files. You are Mara Voss, getaway driver for Delia Rook, the fixer who runs
the sun-bleached port city of Solmar Bay from a payphone and a smile. Steal
cars, run five story jobs — from a first set of wheels to the Big Score at
Bay Federal — dodge the Solmar PD across a living city of traffic,
pedestrians, beaches and docks, and stay out of the cuffs.

Everything is original and self-contained: the city, the names, the flat
canvas art and the soundscape synthesized live with WebAudio. There are no
images, no fonts, no audio files and no libraries — the whole game is eleven ES
modules under `game/src/`, and it makes no network request. The soundscape
is synthesized too: engine hum that follows your speed, surf-and-city
ambience, distant gulls, horns, sirens and gunfire. Nothing here is
from Rockstar: no GTA, Vice City or Liberty City names, no real car brands,
no real people.

## Play it

Open `game/index.html` in a desktop browser, or serve the folder:

```
node serve.ts          # http://localhost:8080
```

- **Walk / drive** — WASD or arrow keys (Shift to run, Space is the handbrake while driving)
- **Enter / exit / steal a car** — E (walk up to a parked or traffic car)
- **Aim** — mouse · **Shoot** — click · **Punch** — Space or F on foot
- **Safehouse rest** — B at the safehouse ($150: full health + ammo)
- **Pause** — P or Esc · **Mute** — M
- **Goal** — follow the yellow marker and the minimap route line; finish all five jobs to complete the story, then keep exporting cars at the port

## The city

A 2560×1920 open world with six recognisable districts, each dressed so you
know where you are at a glance: **Downtown** storefront signs (CAFE SOL,
SURF SHOP, BAR LUNA…), **Motel Row** with its pink MOTEL SOLMAR / PALM MOTEL
/ HOTEL MAR signs, the **Marina**, **Palm Heights** with palm trees on every
block, **Solmar Beach** with umbrellas and towels along the sand, and the
**Port of Solmar** with container docks and gantry cranes. Zebra crosswalks
mark every intersection, the HUD names the district you are in, and the
minimap tints each district and draws a dashed route line to your objective.

Street life is dense and reactive: traffic follows the lanes, turns at
intersections, brakes for pedestrians on crossings and panics — swerving,
honking, dented — when you hit it. Pedestrians stroll the sidewalks, cross
at the crosswalks, dodge cars bearing down on them, and flee from the
actual position of a gunshot or crash, not from Mara in the abstract.

## Wanted: pursuit, search, roadblocks

Wanted level runs 0–5 stars and the police work on **line of sight**:
buildings break vision for police cars and officers alike. While they see
you it is a PURSUIT — cars chase and ram, officers hold a firing line and
**return fire at range** instead of only rushing in to grab you. Break
sight and the chase becomes a SEARCH: units drive to your last-seen point
(the minimap and the world both mark it) and sweep the surrounding blocks
while your heat decays much faster than it does in the open. At **4–5
stars, roadblocks** wait at the intersection ahead. Gunfire is occluded
the same way — a building between you and the target eats the bullet, and
every hit flashes and flinches its target. Busted or wasted, you respawn
at the safehouse — minus a fine.

## Free-roam progression

Every vehicle class drives differently: **coupes** are quick and loose,
**sedans** balanced, **vans and trucks** heavy, slow and grippy — the HUD
names the class when you get in. Between jobs there is always money to
make: a car marked **▼ EXPORT** in green is wanted by the port exporter —
drive it under the main crane at the Port of Solmar for **+$400**, as many
times as you like. Cash also buys rest: press **B** at the safehouse for a
full health and ammo refill ($150).

## The five jobs

| # | Job | The run |
| --- | --- | --- |
| 1 | First Wheels | Steal a car, bring it to Delia's corner — $500 |
| 2 | Courier Run | A **pickup chain**, not just drops: collect a parcel at the Palm Heights bakery → marina drop, collect at the garage → port drop, final parcel → north arcade, all on one 150-second clock — $800 |
| 3 | Heat | Escape a 2-star chase to the safehouse — $1,000 |
| 4 | Repo Job | Steal the marked coupe, deliver it to the garage — up to $1,500; every dent cuts the **careful-driving bonus** |
| 5 | The Big Score | Hit Bay Federal: crack **vault lock 1, then hold lock 2 while it cycles** — the second lock trips the alarm, then lose the 3-star chase to the hideout — $5,000 |

Progress, cash and best stats save to localStorage — Continue picks up where
you left off.

## How it is put together

| File | Its one job |
| --- | --- |
| `game/src/config.js` | Every constant: palette, player stats, driving, combat, wanted |
| `game/src/random.js` | A seeded generator, so runs and staged scenes are reproducible |
| `game/src/input.js` | Keyboard and mouse state for the loop |
| `game/src/audio.js` | All sound, synthesized with WebAudio at the moment it plays |
| `game/src/world.js` | City generation: roads, blocks, buildings, beach, port + collision |
| `game/src/entities.js` | Cars, traffic AI, pedestrians, police chase and officers |
| `game/src/missions.js` | Story, dialogue, and the five-mission step machine |
| `game/src/render.js` | Painting the city, the cast, skid marks, particles, sunset light |
| `game/src/ui.js` | HUD, live minimap with district tints + route line, and the title / pause / busted menus |
| `game/src/staging.js` | The deterministic screenshot stager (`stageShot`) and the scripted self-test (`runSelfTest`) |
| `game/src/main.js` | The canvas, the clock, combat, wanted, screen flow — wires staging in through a small helpers object |

The screenshots in `screenshots/` are real frames of this code, staged
deterministically through the game's own systems (`game/?shot=chase&seed=1`
and its siblings render a scene and hold it), captured in a desktop browser
and handed in unedited. `game/?selftest=1` runs a scripted play-through
(enter a car, drive, trigger a wanted chase, finish a mission step, fire
the pistol, verify a bullet is blocked by a building, break line of sight
until the police enter their SEARCH phase, deliver an export car to the
port crane for its payout, and run the first courier pickup) and reports
PASS/FAIL in the page title.

## Handing it in

`main.ts` (Node 22, standard library only) is the entry's program: it copies
`game/` and `screenshots/` to the output directory and writes `dossier.json`
with the vendored make.fun library in `vendor/makefun-game.ts`.

## License

MIT — see `LICENSE`.
