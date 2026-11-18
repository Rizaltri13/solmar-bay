// staging.js — deterministic scenes for screenshots + the scripted self-test.
//
// This module never runs during ordinary play. main.js hands it a small
// `helpers` object (the verbs that live in main: startGame, tryEnterCar,
// shoot, update, …) and staging drives the real game systems through them:
// it does not fake state the game itself would not produce, it only places
// the pieces and lets the simulation run.
//
// Two entry points:
//   stageShot(G, helpers, name)  — build one named screenshot scene
//   runSelfTest(G, helpers)      — play a scripted run and report PASS/FAIL

import { CFG } from './config.js';
import { currentObjective } from './missions.js';
import { dayPhaseAt } from './render.js';

// Screenshot light is pinned, not sampled: every capture is taken at the
// same point of the day cycle so frames are comparable and reproducible.
export const SHOT_DAY_T = 0.66;

export function pinShotLight(G) {
  G.dayT = SHOT_DAY_T;
  G.dayPhaseIdx = dayPhaseAt(SHOT_DAY_T).index;
  return G.dayT;
}

export function stageShot(G, helpers, name) {
  pinShotLight(G);
  if (name === 'title') {
    G.mode = 'title';
    G.ui.showTitle(null);
    const intro = document.getElementById('story-line');
    if (intro) intro.textContent = helpers.storyIntro;
    return;
  }
  helpers.startGame(false);
  if (name === 'chase') stageChaseShot(G, helpers);
  else if (name === 'mission') stageMissionShot(G, helpers);
  else if (name === 'foot') stageFootShot(G, helpers);
  // A staged frame should show the scene, not a dialogue box over it.
  G.ui.dialogueEl.classList.add('hidden');
  G.ui._dialogueT = 0;
  G.ui.banner(currentObjective(G.missions).text);
}

function pickStarterCar(G) {
  const preferred = G.parked.find((car) => !car.isRepo && (car.model === 'sedan' || car.model === 'coupe'));
  return preferred || G.parked.find((car) => !car.isRepo) || G.parked[0];
}

function enterStarterCar(G, helpers) {
  const car = pickStarterCar(G);
  G.player.x = car.x;
  G.player.y = car.y;
  helpers.tryEnterCar();
  return G.player.car;
}

// Cover scene: Mara driving through Palm Heights with the law right behind
// her — three stars, three units, traffic and pedestrians in frame, and
// the Heat objective drawing the route line across the minimap.
export function stageChaseShot(G, helpers) {
  const car = enterStarterCar(G, helpers);
  car.x = 1280;
  car.y = 1280;
  car.angle = 0;
  car.speed = 380;
  G.setHeat(3 * CFG.HEAT_PER_STAR);
  G.lastSeen = { x: car.x, y: car.y };
  G.police.push(helpers.spawnPoliceCar(G.world, 1010, 1280));
  G.police.push(helpers.spawnPoliceCar(G.world, 1060, 1330));
  G.police.push(helpers.spawnPoliceCar(G.world, 1470, 1280));
  for (const unit of G.police) unit.angle = 0;
  G.missions.idx = 2;
  G.missions.step = 0;
  G.missions.started = true;
  G.autopilot = true;
  G.autopilotTarget = { x: 1920, y: 1280 };
  pullCrowdIntoFrame(G, car.x, car.y);
  G.cam.x = car.x;
  G.cam.y = car.y;
}

// Mission scene: Courier Run with the first parcel already collected and
// the marina drop ahead — timer running, route line drawn.
export function stageMissionShot(G, helpers) {
  const car = enterStarterCar(G, helpers);
  car.x = 1280;
  car.y = 960;
  car.angle = Math.PI / 2;
  car.speed = 300;
  G.missions.idx = 1;
  G.missions.step = 1;
  G.missions.started = true;
  G.missions.timer = 74;
  G.missions.packages = 1;
  G.autopilot = true;
  G.autopilotTarget = { x: 1920, y: 960 };
  pullCrowdIntoFrame(G, car.x, car.y);
  G.cam.x = car.x;
  G.cam.y = car.y;
}

// On-foot scene: Mara aiming down a busy street with a single star and one
// officer close enough to return fire rather than only rush the grab.
export function stageFootShot(G, helpers) {
  G.player.x = 960;
  G.player.y = 960;
  G.player.angle = 0;
  G.player.ammo = 18;
  G.setHeat(1 * CFG.HEAT_PER_STAR);
  G.lastSeen = { x: G.player.x, y: G.player.y };
  G.officers.push(helpers.makeOfficer(9001, 1040, 1005));
  G.missions.idx = 0;
  G.missions.step = 1;
  G.missions.started = true;
  pullCrowdIntoFrame(G, G.player.x, G.player.y);
  G.cam.x = G.player.x;
  G.cam.y = G.player.y;
}

// Screenshots must read as a living city, so the nearest pedestrians and a
// pair of traffic cars are pulled into the frame around the subject.
export function pullCrowdIntoFrame(G, cx, cy) {
  for (let i = 0; i < 5; i++) {
    const ped = G.peds[i];
    if (!ped) continue;
    ped.x = cx - 220 + i * 52;
    ped.y = cy + 52 + (i % 2) * 22;
    ped.dead = false;
    ped.hp = 30;
  }
  const first = G.traffic[0];
  if (first) {
    first.x = cx - 300;
    first.y = cy;
    first.angle = 0;
    first.speed = 60;
  }
  const second = G.traffic[1];
  if (second) {
    second.x = cx + 330;
    second.y = cy - 6;
    second.angle = Math.PI;
    second.speed = 50;
  }
}

// ---- the self-test ---------------------------------------------------------------
//
// A scripted play-through of the real systems: jack a car, drive it, draw a
// chase, finish a mission step, shoot (including a shot a building must
// block), then three focused probes — the police SEARCH phase, the export
// payout, and the courier pickup chain — plus day-cycle checks. The result
// lands in the page title and in #debug as JSON for the harness to read.

export function runSelfTest(G, helpers) {
  const results = {};
  const stepFrames = (n) => {
    for (let i = 0; i < n; i++) helpers.update(1 / 60);
  };
  try {
    helpers.startGame(false);
    results.started = G.mode === 'play';
    stepFrames(60);

    const starter = G.parked[G.parked.length - 1];
    const startX = starter.x;
    const startY = starter.y;
    G.player.x = starter.x;
    G.player.y = starter.y;
    results.enterCar = helpers.tryEnterCar();
    results.vehicleClass = G.player.car ? G.player.car.model : null;
    G.scriptInput = { x: 0, y: -1, handbrake: false };
    stepFrames(240);
    results.drove = Math.abs(G.player.car.speed) > 50;
    results.carMoved = Math.hypot(G.player.car.x - startX, G.player.car.y - startY) > 50;

    G.addHeat(60);
    stepFrames(240);
    results.wanted = G.wantedStars();
    results.policeSpawned = G.police.length > 0;
    results.officersSpawned = G.officers.length > 0;

    G.player.car.x = CFG.DELIA.x;
    G.player.car.y = CFG.DELIA.y;
    G.player.car.speed = 0;
    G.scriptInput = null;
    stepFrames(30);
    results.missionAdvanced = G.missions.idx >= 1;
    results.missionObjective = currentObjective(G.missions).text;

    // Combat is staged on the open 960/960 intersection on purpose: firing
    // from wherever the car stopped made the result depend on whether a
    // building happened to stand east of that spot, and the (correct)
    // occlusion rule would eat the bullet. The intersection is always open.
    helpers.exitCar();
    G.player.x = 960;
    G.player.y = 960;
    G.player.angle = 0;
    const target = G.peds.find((ped) => !ped.dead) || G.peds[0];
    target.x = G.player.x + 120;
    target.y = G.player.y;
    target.hp = 30;
    target.hitFlash = 0;
    helpers.aimAtScreenOffset(120, 0);
    G.player.shootCd = 0;
    helpers.shoot();
    results.shotFired = G.player.ammo < CFG.START_AMMO;
    results.targetHit = target.hp < 30;
    results.hitReaction = target.hitFlash > 0 || target.flee > 0;

    const building = G.world.buildings[0];
    if (building) {
      G.player.x = building.x - 60;
      G.player.y = building.y + building.h / 2;
      G.player.angle = 0;
      const shielded = G.peds.find((ped) => !ped.dead && ped !== target) || G.peds[1];
      shielded.x = building.x + building.w + 60;
      shielded.y = G.player.y;
      shielded.hp = 30;
      helpers.aimAtScreenOffset(300, 0);
      G.player.shootCd = 0;
      G.player.ammo = Math.max(G.player.ammo, 6);
      helpers.shoot();
      results.bulletBlockedByBuilding = shielded.hp >= 30;
    }

    results.searchPhase = testSearchPhase(G, helpers, stepFrames);
    results.exportPaid = testExportDelivery(G, helpers, stepFrames);
    results.courierPickupChain = testCourierPickup(G, helpers, stepFrames);

    G.player.punchCd = 0;
    helpers.punch();
    G.setHeat(0);
    G.police = [];
    G.officers = [];
    G.roadblocks = [];
    stepFrames(120);
    helpers.saveBest();
    results.saveWritten = Boolean(localStorage.getItem('solmarbay-save'));

    const dayBefore = G.dayT;
    stepFrames(120);
    results.dayCycleAdvances = G.dayT > dayBefore || G.dayT < dayBefore - 0.5;
    results.dayPhaseLabel = dayPhaseAt(G.dayT).label;
    results.dayClockReadable = /^\d{2}:\d{2}$/.test(dayPhaseAt(G.dayT).clock);
    results.shotLightPinned = dayPhaseAt(SHOT_DAY_T).label === 'GOLDEN HOUR'
      && Math.abs(pinShotLight(G) - SHOT_DAY_T) < 1e-9;

    results.finalCash = Math.floor(G.player.cash);
    results.errors = G.errors;
    results.pass = Boolean(
      results.started && results.enterCar && results.drove && results.carMoved
      && results.wanted >= 2 && results.policeSpawned && results.missionAdvanced
      && results.shotFired && results.targetHit && results.bulletBlockedByBuilding
      && results.saveWritten
      && results.searchPhase && results.exportPaid && results.courierPickupChain
      && results.dayCycleAdvances && results.dayClockReadable && results.shotLightPinned
      && G.errors.length === 0,
    );
  } catch (err) {
    G.errors.push('selftest exception: ' + (err && err.message));
    results.pass = false;
    results.errors = G.errors;
  }

  const headline = (results.pass ? 'SELFTEST PASS' : 'SELFTEST FAIL')
    + ' missionIdx=' + G.missions.idx
    + ' wanted=' + G.wantedStars()
    + ' police=' + G.police.length
    + ' errors=' + G.errors.length;
  document.title = headline;
  const debugEl = document.getElementById('debug');
  if (debugEl) {
    debugEl.textContent = JSON.stringify(results);
    debugEl.dataset.done = '1';
  }
  return results;
}

// SEARCH probe: be seen at close range on open ground, then vanish across
// the map. The single pursuing unit — reinforcements are held back, since a
// fresh unit spawning beside Mara would legitimately re-acquire her — must
// flip into its search state while Mara stays wanted.
export function testSearchPhase(G, helpers, stepFrames) {
  try {
    if (!G.player.inCar) {
      const fallback = G.parked[G.parked.length - 1] || G.traffic[0];
      if (!fallback) return false;
      G.player.x = fallback.x;
      G.player.y = fallback.y;
      helpers.tryEnterCar();
    }
    G.player.car.x = CFG.PORT_CRANE.x;
    G.player.car.y = CFG.PORT_CRANE.y - 140;
    G.player.car.speed = 0;
    G.setHeat(3 * CFG.HEAT_PER_STAR);
    const unit = helpers.spawnPoliceCar(G.world, G.player.car.x - 120, G.player.car.y);
    G.police = [unit];
    G.officers = [];
    stepFrames(20);
    const wasSeen = Boolean(G.lastSeen) && !G.searching;

    G.player.car.x = CFG.BANK.x;
    G.player.car.y = CFG.BANK.y;
    G.player.car.speed = 0;
    for (let i = 0; i < 15; i++) {
      G.policeSpawnT = 5;
      stepFrames(10);
      G.police = G.police.filter((car) => car === unit);
      G.officers = [];
      G.setHeat(Math.max(G.heat, 30));
    }
    return wasSeen && G.searching === true && G.wantedStars() >= 1
      && unit.policeState === 'search';
  } catch (err) {
    G.errors.push('search test: ' + (err && err.message));
    return false;
  }
}

// Export probe: mark a car, drive it (by placement) under the crane, and
// require the payout, the export counter, and Mara ending up on foot.
export function testExportDelivery(G, helpers, stepFrames) {
  try {
    G.setHeat(0);
    G.police = [];
    G.officers = [];
    if (G.player.inCar) helpers.exitCar();
    const candidate = G.parked.find((car) => !car.isRepo) || G.parked[0];
    if (!candidate) return false;
    candidate.isExport = true;
    G.exportCar = candidate;
    G.player.x = candidate.x;
    G.player.y = candidate.y;
    if (!helpers.tryEnterCar()) return false;
    const cashBefore = G.player.cash;
    G.player.car.x = CFG.PORT_CRANE.x;
    G.player.car.y = CFG.PORT_CRANE.y;
    G.player.car.speed = 0;
    stepFrames(30);
    return G.player.cash > cashBefore && (G.exportsDone || 0) >= 1 && !G.player.inCar;
  } catch (err) {
    G.errors.push('export test: ' + (err && err.message));
    return false;
  }
}

// Courier probe: the first Courier Run step is a pickup, so standing on its
// target must bank a package and advance the step machine.
export function testCourierPickup(G, helpers, stepFrames) {
  try {
    G.missions.idx = 1;
    G.missions.step = 0;
    G.missions.started = false;
    G.missions.packages = 0;
    helpers.startMission();
    const objective = currentObjective(G.missions);
    if (!objective.target) return false;
    if (G.player.inCar && G.player.car) {
      G.player.car.x = objective.target.x;
      G.player.car.y = objective.target.y;
      G.player.car.speed = 0;
    } else {
      G.player.x = objective.target.x;
      G.player.y = objective.target.y;
    }
    stepFrames(30);
    return G.missions.packages >= 1 && G.missions.step >= 1;
  } catch (err) {
    G.errors.push('courier test: ' + (err && err.message));
    return false;
  }
}
