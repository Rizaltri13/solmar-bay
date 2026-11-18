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
images, no fonts, no audio files and no libraries — the whole game is ten ES
modules under `game/src/`, and it makes no network request. Nothing here is
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
- **Pause** — P or Esc · **Mute** — M
- **Goal** — follow the yellow marker; finish all five jobs to complete the story

## The city

A 2560×1920 open world: a road grid with traffic that follows the lanes and
turns at intersections, pedestrians strolling the sidewalks, a beach and
ocean on the east edge, and the Port of Solmar with its container docks in
the south-west. Wanted level runs 0–5 stars: police cars chase and ram,
officers close in on foot, and the heat decays when you slip out of sight.
Busted or wasted, you respawn at the safehouse — minus a fine.

## The five jobs

| # | Job | The run |
| --- | --- | --- |
| 1 | First Wheels | Steal a car, bring it to Delia's corner — $500 |
| 2 | Courier Run | Three drops against a 90-second clock — $800 |
| 3 | Heat | Escape a 2-star chase to the safehouse — $1,000 |
| 4 | Repo Job | Steal the marked coupe, deliver it to the garage — $1,500 |
| 5 | The Big Score | Hit Bay Federal, grab the cash, lose a 3-star chase to the hideout — $5,000 |

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
| `game/src/ui.js` | HUD, live minimap, and the title / pause / busted menus |
| `game/src/main.js` | The canvas, the clock, combat, wanted, screen flow — and the screenshot stager |

The screenshots in `screenshots/` are real frames of this code, staged
deterministically through the game's own systems (`game/?shot=chase&seed=1`
and its siblings render a scene and hold it), captured in a desktop browser
and handed in unedited. `game/?selftest=1` runs a scripted 30-second
play-through (enter a car, drive, trigger a wanted chase, finish a mission
step, fire the pistol) and reports PASS/FAIL in the page title.

## Handing it in

`main.ts` (Node 22, standard library only) is the entry's program: it copies
`game/` and `screenshots/` to the output directory and writes `dossier.json`
with the vendored make.fun library in `vendor/makefun-game.ts`.

## License

MIT — see `LICENSE`.
