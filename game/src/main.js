// main.js — Solmar Bay's engine room.
//
// This module owns the things no other module may own: the canvas, the
// game-state object G, the per-frame update order, combat resolution, the
// wanted system (vision → pursuit/search → roadblocks → decay), screen
// flow, and the save file. Everything else is a service it calls:
// world.js builds the city, entities.js steps the cast, missions.js runs
// the jobs, render.js + ui.js paint, staging.js handles ?shot=/?selftest=.

import { CFG } from './config.js';
import { RNG } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { createWorld } from './world.js';
import {
  makeCar, spawnParked, spawnTraffic, spawnPeds, spawnPoliceCar, makeOfficer,
  makeRoadblockCar, panicTrafficCar, vehicleClass,
  driveCar, updateTraffic, updatePeds, updatePolice, updateOfficers,
} from './entities.js';
import {
  STORY_INTRO, MISSIONS, missionState, currentMission,
  currentObjective, startMission, updateMissions,
  markExportCar, updateExportActivity, trySafehouseService,
} from './missions.js';
import { stageShot, runSelfTest } from './staging.js';
import { drawWorld, dayPhaseAt } from './render.js';
import { UI, drawHUD } from './ui.js';

// ---- boot-time wiring ---------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const query = new URLSearchParams(location.search);
const seed = parseInt(query.get('seed') || '1', 10) || 1;
const shotName = query.get('shot');
const selftestMode = query.get('selftest') === '1';

const rng = new RNG(seed);
const world = createWorld(rng);
const input = new Input(canvas);
const audio = new AudioSys();
const ui = new UI(document);

const SAVE_KEY = 'solmarbay-save';

const G = {
  mode: 'title',
  time: 0,
  seed,
  world,
  rng,
  input,
  audio,
  ui,
  player: {
    x: CFG.SPAWN.x,
    y: CFG.SPAWN.y,
    angle: -Math.PI / 2,
    hp: CFG.PLAYER_HP,
    cash: 150,
    ammo: CFG.START_AMMO,
    inCar: false,
    car: null,
    shootCd: 0,
    punchCd: 0,
    bustedT: 0,
    walkPhase: 0,
  },
  parked: [],
  traffic: [],
  peds: [],
  police: [],
  officers: [],
  roadblocks: [],
  skid: [],
  particles: [],
  floatTexts: [],
  heat: 0,
  lastSeenT: 0,
  decayT: 0,
  // Pursuit bookkeeping: seenNow is this frame's vision verdict, lastSeen
  // is where the police believe Mara is, searching marks the SEARCH phase.
  seenNow: false,
  lastSeen: null,
  unseenT: 0,
  searching: false,
  roadblockStars: 0,
  danger: null,
  dangerT: 0,
  exportCar: null,
  exportsDone: 0,
  gullT: 8,
  ambienceStarted: false,
  // dayT only advances in play mode, so menus and staged frames hold light.
  dayT: CFG.DAY_START,
  dayPhaseIdx: -1,
  stats: { missionsCompleted: 0, exportsDone: 0, cashEarned: 0, timePlayed: 0 },
  missions: missionState(),
  missionDelay: 0,
  policeSpawnT: 0,
  respawnT: 0,
  cam: { x: CFG.SPAWN.x, y: CFG.SPAWN.y },
  shake: 0,
  errors: [],
  scriptInput: null,
  autopilot: false,
  autopilotTarget: null,
  save: null,
};

G.playerPos = () => (G.player.inCar && G.player.car)
  ? { x: G.player.car.x, y: G.player.car.y }
  : { x: G.player.x, y: G.player.y };
G.wantedStars = () => Math.min(5, Math.floor(G.heat / CFG.HEAT_PER_STAR));
G.addHeat = (amount) => {
  G.heat = Math.min(CFG.MAX_HEAT, G.heat + amount);
  G.lastSeenT = 0;
};
G.setHeat = (value) => {
  G.heat = Math.max(0, Math.min(CFG.MAX_HEAT, value));
};
G.currentObjective = () => currentObjective(G.missions);
G.addPickupText = (x, y, text, color = '#fff') => {
  G.floatTexts.push({ x, y, text, color, life: 1.6 });
};
G.saveBest = () => {
  try {
    const previous = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    const bestCash = Math.max(G.player.cash, (previous && previous.bestCash) || 0);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.floor(G.player.cash),
      missionIdx: G.missions.idx,
      bestCash,
      savedAt: Date.now(),
    }));
  } catch (err) { /* storage can be unavailable; the game continues */ }
};
G.loadSave = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch (err) {
    return null;
  }
};

// ---- initial population ---------------------------------------------------------

function populateCity() {
  G.parked = spawnParked(world, rng, 14);
  G.traffic = spawnTraffic(world, rng, 12);
  G.peds = spawnPeds(world, rng, 16);
  const repoCoupe = makeCar(2080, 1280, 0, '#f1c40f', 'coupe', 'parked');
  repoCoupe.isRepo = true;
  G.parked.push(repoCoupe);
  // A guaranteed starter car by the safehouse keeps mission 1 always open.
  G.parked.push(makeCar(560, 320, 0, '#c0392b', 'sedan', 'parked'));
  markExportCar(G, rng);
}
populateCity();
G.save = G.loadSave();

// ---- error capture (the self-test asserts this stays empty) ----------------------

window.addEventListener('error', (event) => {
  G.errors.push(String(event.message || event.error));
});
window.addEventListener('unhandledrejection', (event) => {
  G.errors.push('rejection: ' + String(event.reason));
});
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  G.errors.push(args.map(String).join(' '));
  originalConsoleError(...args);
};

// ---- getting into cars -------------------------------------------------------------

function closestCar(px, py, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of [...G.parked, ...G.traffic]) {
    const dist = Math.hypot(car.x - px, car.y - py);
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

function tryEnterCar() {
  const player = G.player;
  const car = closestCar(player.x, player.y, 64);
  if (!car) {
    ui.banner('No car in reach — walk closer to one');
    return false;
  }
  G.parked = G.parked.filter((entry) => entry !== car);
  G.traffic = G.traffic.filter((entry) => entry !== car);
  car.kind = 'player';
  player.car = car;
  player.inCar = true;
  player.angle = car.angle;
  audio.tone(300, 0.08, 'square', 0.1, 500);
  if (car.isRepo) {
    ui.banner('Repo coupe secured — get it to the garage, scratch-free!');
  } else if (car.isExport) {
    ui.banner('Export car! Deliver it under the port crane for cash');
  } else {
    const feel = car.model === 'coupe'
      ? 'quick and loose'
      : (car.model === 'truck' || car.model === 'van' ? 'heavy, slow, grippy' : 'balanced city ride');
    ui.banner(`${vehicleClass(car.model).label} — ${feel}`);
  }
  return true;
}

function exitCar() {
  const player = G.player;
  if (!player.car) return;
  const car = player.car;
  player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
  player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
  player.angle = car.angle;
  car.kind = 'parked';
  G.parked.push(car);
  player.car = null;
  player.inCar = false;
}

// ---- combat ---------------------------------------------------------------------------

function spawnBurst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const heading = rng.range(0, Math.PI * 2);
    const speed = rng.range(40, 160);
    G.particles.push({
      x, y,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      size: rng.range(2, 4),
      color,
      life: 0.5,
      max: 0.5,
    });
  }
}

function shoot() {
  const player = G.player;
  if (player.shootCd > 0 || player.ammo <= 0 || player.inCar) return;
  player.shootCd = CFG.PISTOL_RATE;
  player.ammo -= 1;
  audio.shoot();

  const heading = input.mouseAngleFrom(player.x, player.y, G.cam, canvas);
  player.angle = heading;

  // A gunshot is a place, not a rumour: nearby civilians flee from here.
  G.danger = { x: player.x, y: player.y };
  G.dangerT = 2.5;
  for (const ped of G.peds) {
    if (Math.hypot(ped.x - player.x, ped.y - player.y) < 260) {
      ped.flee = Math.max(ped.flee, 2.5);
    }
  }

  // Occlusion: step along the shot until a building swallows the round;
  // nothing beyond that point can be hit.
  let effectiveRange = CFG.PISTOL_RANGE;
  for (let d = 24; d < CFG.PISTOL_RANGE; d += 14) {
    const probeX = player.x + Math.cos(heading) * d;
    const probeY = player.y + Math.sin(heading) * d;
    if (world.pointInBuilding(probeX, probeY)) {
      effectiveRange = d;
      break;
    }
  }
  const endX = player.x + Math.cos(heading) * effectiveRange;
  const endY = player.y + Math.sin(heading) * effectiveRange;

  G.particles.push({
    x: player.x + Math.cos(heading) * 20,
    y: player.y + Math.sin(heading) * 20,
    size: 5, color: '#ffe600', life: 0.12, max: 0.12,
  });
  if (effectiveRange < CFG.PISTOL_RANGE) {
    G.particles.push({ x: endX, y: endY, size: 4, color: '#ffb347', life: 0.2, max: 0.2 });
  }

  // Hitscan against the nearest target close to the shot line.
  let victim = null;
  let victimKind = null;
  let victimAlong = Infinity;
  const considerTarget = (obj, radius, kind) => {
    const dx = obj.x - player.x;
    const dy = obj.y - player.y;
    const along = dx * Math.cos(heading) + dy * Math.sin(heading);
    if (along < 0 || along > effectiveRange) return;
    const across = Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading));
    if (across < radius + 14 && along < victimAlong) {
      victimAlong = along;
      victim = obj;
      victimKind = kind;
    }
  };
  for (const ped of G.peds) if (!ped.dead) considerTarget(ped, 12, 'ped');
  for (const officer of G.officers) considerTarget(officer, 12, 'officer');
  for (const unit of G.police) considerTarget(unit, 18, 'policecar');

  if (victim) {
    audio.hit();
    spawnBurst(victim.x, victim.y, '#ff5b4d', 8);
    victim.hitFlash = 0.35;
    if (victimKind === 'ped') {
      victim.hp -= CFG.PISTOL_DAMAGE;
      victim.flee = 3;
      if (victim.hp <= 0) {
        victim.dead = true;
        G.addHeat(10);
        ui.banner('Pedestrian down — the heat rises');
      }
    } else if (victimKind === 'officer') {
      victim.hp -= CFG.PISTOL_DAMAGE;
      if (victim.hp <= 0) {
        G.officers = G.officers.filter((entry) => entry !== victim);
        G.addHeat(15);
      }
    } else {
      victim.hp -= CFG.PISTOL_DAMAGE;
      victim.damage = (victim.damage || 0) + CFG.PISTOL_DAMAGE;
      if (victim.hp <= 0) {
        victim.speed = 0;
        victim.targetSpeed = 0;
        spawnBurst(victim.x, victim.y, '#888', 16);
        G.addHeat(10);
      }
    }
  }
  G.particles.push({ x: endX, y: endY, size: 2, color: 'rgba(255,230,0,0.6)', life: 0.08, max: 0.08 });
}

function punch() {
  const player = G.player;
  if (player.punchCd > 0 || player.inCar) return;
  player.punchCd = CFG.PUNCH_RATE;
  audio.punch();
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (Math.hypot(ped.x - player.x, ped.y - player.y) < CFG.PUNCH_RANGE) {
      ped.hp -= CFG.PUNCH_DAMAGE;
      ped.flee = 3;
      ped.hitFlash = 0.35;
      G.danger = { x: player.x, y: player.y };
      G.dangerT = 2;
      if (ped.hp <= 0) {
        ped.dead = true;
        G.addHeat(10);
      }
      return;
    }
  }
  for (const officer of G.officers) {
    if (Math.hypot(officer.x - player.x, officer.y - player.y) < CFG.PUNCH_RANGE) {
      officer.hp -= CFG.PUNCH_DAMAGE;
      if (officer.hp <= 0) {
        G.officers = G.officers.filter((entry) => entry !== officer);
      }
      G.addHeat(5);
      return;
    }
  }
}

// ---- wanted: vision, spawning, roadblocks, decay ---------------------------------------

function desiredResponse() {
  const stars = G.wantedStars();
  return { cars: stars, officers: stars >= 1 ? Math.min(3, stars) : 0 };
}

// One vision verdict per frame, shared by every unit so the whole force
// agrees about whether Mara is visible. Point-blank contact always counts
// as seen; otherwise it is range plus an unobstructed line.
export function computeVision(pos, dt = 1 / 60) {
  let seen = false;
  const watchers = [...G.police, ...G.officers, ...G.roadblocks];
  for (const watcher of watchers) {
    const dist = Math.hypot(watcher.x - pos.x, watcher.y - pos.y);
    if (dist < 70) { seen = true; break; }
    if (dist <= CFG.SIGHT_RANGE && !world.lineBlocked(watcher.x, watcher.y, pos.x, pos.y)) {
      seen = true;
      break;
    }
  }
  if (seen) {
    G.seenNow = true;
    G.lastSeen = { x: pos.x, y: pos.y };
    G.unseenT = 0;
  } else {
    G.seenNow = false;
    G.unseenT += dt;
  }
  G.searching = !seen && G.wantedStars() > 0 && Boolean(G.lastSeen)
    && G.unseenT > CFG.SEARCH_ENTER_TIME;
  return { seen, lastSeen: G.lastSeen };
}

function maintainRoadblocks(pos) {
  const stars = G.wantedStars();
  if (stars < CFG.ROADBLOCK_STARS) {
    G.roadblocks = [];
    G.roadblockStars = 0;
    return;
  }
  if (G.roadblockStars === stars && G.roadblocks.length >= 2) return;
  G.roadblockStars = stars;
  const heading = (G.player.inCar && G.player.car) ? G.player.car.angle : G.player.angle;
  const anchor = world.roadblockAhead(pos.x, pos.y, heading);
  const across = heading + Math.PI / 2;
  G.roadblocks = [
    makeRoadblockCar(world, anchor.x - 16, anchor.y, across),
    makeRoadblockCar(world, anchor.x + 16, anchor.y + 10, across),
  ];
  if (stars >= 5) {
    G.roadblocks.push(makeRoadblockCar(world, anchor.x, anchor.y - 26, across));
  }
  ui.banner('ROADBLOCK ahead — break through or detour!');
}

function updateWanted(dt) {
  const pos = G.playerPos();
  const wanted = desiredResponse();
  G.policeSpawnT -= dt;

  if (G.police.length < wanted.cars && G.policeSpawnT <= 0) {
    G.policeSpawnT = 1.2;
    const heading = rng.range(0, Math.PI * 2);
    const rawX = Math.max(60, Math.min(world.w - 60, pos.x + Math.cos(heading) * 520));
    const rawY = Math.max(60, Math.min(world.h - 60, pos.y + Math.sin(heading) * 520));
    const snap = world.nearestRoadPoint(rawX, rawY);
    const unit = spawnPoliceCar(world, snap.x, snap.y);
    if (G.lastSeen) unit.lastSeen = { ...G.lastSeen };
    G.police.push(unit);
  }
  if (G.officers.length < wanted.officers && G.policeSpawnT <= 0) {
    const snap = world.nearestRoadPoint(
      pos.x + rng.range(-380, 380),
      pos.y + rng.range(-380, 380),
    );
    const officerId = 9000 + G.officers.length + Math.floor(rng.range(0, 400));
    G.officers.push(makeOfficer(officerId, snap.x, snap.y));
  }

  maintainRoadblocks(pos);

  // Heat only cools while unseen — slowly in the open, quickly while the
  // force is searching a stale last-seen point.
  if (!G.seenNow && G.wantedStars() > 0) {
    G.decayT += dt;
    const rate = G.searching ? CFG.SEARCH_DECAY_RATE : CFG.DECAY_RATE;
    const delay = G.searching ? 0.8 : CFG.DECAY_DELAY;
    if (G.decayT > delay) G.heat = Math.max(0, G.heat - rate * dt);
  } else {
    G.decayT = 0;
    G.lastSeenT = 0;
  }

  if (G.wantedStars() === 0) {
    G.police = G.police.filter((unit) => Math.hypot(unit.x - pos.x, unit.y - pos.y) < 900);
    if (G.police.length === 0) G.officers = [];
    G.roadblocks = [];
    G.roadblockStars = 0;
    G.searching = false;
    G.lastSeen = null;
    audio.stopSiren();
  } else {
    audio.startSiren();
  }
}

// ---- run endings --------------------------------------------------------------------------

function endRun(kind) {
  if (G.mode !== 'play') return;
  G.mode = 'end';
  audio.stopSiren();
  audio.busted();
  G.saveBest();
  if (kind === 'busted') {
    const fine = Math.floor(G.player.cash * 0.1);
    G.player.cash -= fine;
    ui.showEnd('busted', `The Solmar PD caught up with Mara. Fine paid: $${fine}. The city is still yours — go again.`);
  } else {
    ui.showEnd('wasted', 'Mara is down. The bay keeps its secrets — for now. Respawn at the safehouse and run it back.');
  }
}

function respawn() {
  const player = G.player;
  if (player.inCar && player.car) {
    player.car.kind = 'parked';
    G.parked.push(player.car);
    player.car = null;
  }
  player.inCar = false;
  player.x = CFG.SAFEHOUSE.x;
  player.y = CFG.SAFEHOUSE.y;
  player.hp = CFG.PLAYER_HP;
  player.ammo = Math.max(player.ammo, CFG.START_AMMO);
  G.setHeat(0);
  G.police = [];
  G.officers = [];
  G.roadblocks = [];
  G.searching = false;
  G.lastSeen = null;
  G.unseenT = 0;
  audio.stopEngine();
  G.cam.x = player.x;
  G.cam.y = player.y;
  ui.hideEnd();
  G.mode = 'play';
  ui.banner('Back on the street — Delia is waiting');
}

// ---- driving collisions ----------------------------------------------------------------------

function handleDrivingCollisions(dt) {
  const player = G.player;
  const car = player.car;

  for (const other of [...G.traffic, ...G.parked]) {
    if (Math.abs(car.speed) <= 90) continue;
    if (Math.hypot(other.x - car.x, other.y - car.y) >= 40) continue;
    panicTrafficCar(other, car.x, car.y);
    audio.honk();
    audio.crash();
    spawnBurst(other.x, other.y, '#ffb347', 6);
    car.speed *= 0.55;
    other.speed = (other.speed || 0) + 60;
    if (car.isRepo) G.missions.repoDamage += 2;
    G.danger = { x: other.x, y: other.y };
    G.dangerT = 2;
  }

  for (const block of G.roadblocks) {
    if (Math.hypot(block.x - car.x, block.y - car.y) < 42 && Math.abs(car.speed) > 60) {
      audio.crash();
      G.shake = Math.max(G.shake, 8);
      player.hp -= 4;
      spawnBurst(block.x, block.y, '#9fb7ff', 8);
      car.speed *= -0.2;
    }
  }

  for (const unit of G.police) {
    if (Math.hypot(unit.x - car.x, unit.y - car.y) < 44) {
      player.hp -= 5 * dt;
      G.shake = Math.max(G.shake, 3);
      unit.speed *= 0.6;
      if (rng.next() < dt * 2) spawnBurst(unit.x, unit.y, '#9fb7ff', 4);
    }
  }
}

// ---- street density ------------------------------------------------------------------------------
//
// The city only feels alive near Mara, so density is maintained locally:
// count traffic and pedestrians inside a radius, top up just outside the
// view when it thins, and recycle whatever has been stranded far away.

function maintainDensity() {
  const pos = G.playerPos();
  const nearTraffic = G.traffic.filter(
    (car) => Math.hypot(car.x - pos.x, car.y - pos.y) < 700,
  );
  if (nearTraffic.length < 7) {
    const fresh = spawnTraffic(world, rng, 1)[0];
    const snap = world.nearestRoadPoint(
      pos.x + rng.range(-620, 620),
      pos.y + rng.range(-620, 620),
    );
    fresh.x = snap.x + rng.range(-12, 12);
    fresh.y = snap.y + rng.range(-12, 12);
    if (Math.hypot(fresh.x - pos.x, fresh.y - pos.y) > 420) G.traffic.push(fresh);
  }
  const nearPeds = G.peds.filter(
    (ped) => !ped.dead && Math.hypot(ped.x - pos.x, ped.y - pos.y) < 650,
  );
  if (nearPeds.length < 9) {
    const fresh = spawnPeds(world, rng, 1)[0];
    fresh.x = pos.x + rng.range(-520, 520);
    fresh.y = pos.y + rng.range(-520, 520);
    if (!world.pointInBuilding(fresh.x, fresh.y)
      && Math.hypot(fresh.x - pos.x, fresh.y - pos.y) > 300) {
      G.peds.push(fresh);
    }
  }
  G.traffic = G.traffic.filter(
    (car) => Math.hypot(car.x - pos.x, car.y - pos.y) < 1500 || G.traffic.length <= 14,
  );
  if (G.peds.length > 30) {
    G.peds = G.peds.filter(
      (ped) => ped.dead || Math.hypot(ped.x - pos.x, ped.y - pos.y) < 1200,
    );
  }
}

// ---- the frame update ------------------------------------------------------------------------------

function resolveMovement(dt) {
  // Scripted input (self-test) and autopilot (staged driving shots) both
  // override the physical keyboard, in that order of precedence.
  const player = G.player;
  let mv = input.moveVec();
  if (G.scriptInput) mv = G.scriptInput;
  if (G.autopilot && player.inCar && player.car) {
    const target = G.autopilotTarget || { x: 1440, y: 1120 };
    const desired = Math.atan2(target.y - player.car.y, target.x - player.car.x);
    let diff = desired - player.car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    mv = { x: Math.max(-1, Math.min(1, diff * 2)), y: -1, handbrake: false };
    if (Math.hypot(target.x - player.car.x, target.y - player.car.y) < 120) {
      G.autopilotTarget = world.randomRoadPoint(rng);
    }
  }
  return mv;
}

function updateDriving(dt, mv) {
  const player = G.player;
  const outcome = driveCar(player.car, mv, dt, world, (impactSpeed) => {
    audio.crash();
    G.shake = Math.min(14, impactSpeed / 40);
    spawnBurst(player.car.x, player.car.y, '#ffb347', 10);
    player.hp -= Math.max(2, impactSpeed / 60);
    G.danger = { x: player.car.x, y: player.car.y };
    G.dangerT = 2;
    if (player.car.isRepo) G.missions.repoDamage += Math.max(1, impactSpeed / 90);
    player.car.damage = Math.min(100, (player.car.damage || 0) + impactSpeed / 22);
  });
  handleDrivingCollisions(dt);
  if (outcome.drifting) {
    G.skid.push({
      x: player.car.x - Math.cos(player.car.angle) * 18,
      y: player.car.y - Math.sin(player.car.angle) * 18,
      angle: player.car.angle,
      life: 1,
    });
    if (G.skid.length > 220) G.skid.shift();
  }
  // Exhaust puffs come from the seeded stream so staged frames reproduce.
  if (Math.abs(player.car.speed) > 60 && rng.next() < dt * 8) {
    G.particles.push({
      x: player.car.x - Math.cos(player.car.angle) * 24,
      y: player.car.y - Math.sin(player.car.angle) * 24,
      size: 3, color: 'rgba(200,200,200,0.5)', life: 0.4, max: 0.4,
    });
  }
}

function updateOnFoot(dt, mv) {
  const player = G.player;
  const running = input.anyDown(['ShiftLeft', 'ShiftRight']);
  const speed = running ? CFG.RUN_SPEED : CFG.WALK_SPEED;
  player.x += mv.x * speed * dt;
  player.y += mv.y * speed * dt;
  if (mv.x || mv.y) {
    player.angle = Math.atan2(mv.y, mv.x);
    player.walkPhase += dt * 10;
  }
  world.resolveCircle(player, CFG.PLAYER_R);

  for (const unit of G.police) {
    if (Math.hypot(unit.x - player.x, unit.y - player.y) < 30) {
      player.hp -= 12 * dt;
      G.shake = Math.max(G.shake, 4);
    }
  }

  const grabber = G.officers.find(
    (officer) => Math.hypot(officer.x - player.x, officer.y - player.y) < 28,
  );
  if (grabber) {
    player.bustedT += dt;
    if (player.bustedT > 1.2) {
      player.bustedT = 0;
      endRun('busted');
      return false;
    }
  } else {
    player.bustedT = 0;
  }

  if (input.mouse.down || input.mouse.clicked) shoot();
  if (input.wasPressedAny(['Space', 'KeyF'])) punch();
  return true;
}

function update(dt) {
  G.time += dt;
  ui.tick(dt);
  if (G.mode !== 'play') return;

  const player = G.player;
  G.dayT = (G.dayT + dt / CFG.DAY_CYCLE_SECONDS) % 1;
  G.stats.timePlayed += dt;
  const phaseIndex = dayPhaseAt(G.dayT).index;
  if (G.dayPhaseIdx >= 0 && phaseIndex !== G.dayPhaseIdx && audio.ctx && !audio.muted) {
    audio.dayChime();
  }
  G.dayPhaseIdx = phaseIndex;

  player.shootCd = Math.max(0, player.shootCd - dt);
  player.punchCd = Math.max(0, player.punchCd - dt);
  if (G.wantedStars() === 0 && player.hp < CFG.PLAYER_HP) {
    player.hp = Math.min(CFG.PLAYER_HP, player.hp + 2 * dt);
  }

  const mv = resolveMovement(dt);
  if (input.wasPressed('KeyM')) {
    const muted = audio.toggleMute();
    ui.banner(muted ? 'Muted' : 'Sound on');
  }

  if (player.inCar && player.car) updateDriving(dt, mv);
  else if (!updateOnFoot(dt, mv)) return;

  if (input.wasPressed('KeyE')) {
    audio.ensure();
    if (player.inCar) exitCar();
    else tryEnterCar();
  }
  if (input.wasPressed('KeyB')) {
    audio.ensure();
    trySafehouseService(G);
  }

  if (!G.ambienceStarted && audio.ctx) {
    audio.startAmbience();
    G.ambienceStarted = true;
  }
  audio.updateEngine(
    player.inCar && player.car ? player.car.speed / CFG.CAR_MAX_SPEED : 0,
    Boolean(player.inCar && player.car),
  );
  G.gullT -= dt;
  if (G.gullT <= 0) {
    G.gullT = rng.range(9, 20);
    if (audio.ctx && !audio.muted) audio.gull();
  }

  // Vision first: every AI below acts on the same verdict this frame.
  const vision = computeVision(G.playerPos(), dt);
  G.dangerT = Math.max(0, G.dangerT - dt);
  const liveDanger = G.dangerT > 0 ? G.danger : null;

  const everyCar = [
    ...G.parked, ...G.traffic, ...G.police, ...G.roadblocks,
    ...(player.car ? [player.car] : []),
  ];
  updateTraffic(G.traffic, world, dt, rng, everyCar, G.peds);
  const posNow = G.playerPos();
  for (const car of G.traffic) {
    if (!car.wantsHonk) continue;
    car.wantsHonk = false;
    if (Math.hypot(car.x - posNow.x, car.y - posNow.y) < 520) audio.honkBlocked(car.id);
  }
  updatePeds(G.peds, world, dt, rng, liveDanger, everyCar);
  updatePolice(G.police, G.playerPos(), dt, world, vision);
  updateOfficers(G.officers, G.playerPos(), dt, world, vision);

  // Officer return fire: entities raise the flag, main resolves the shot.
  for (const officer of G.officers) {
    if (!officer.wantsFire) continue;
    officer.wantsFire = false;
    audio.officerShot();
    const targetPos = G.playerPos();
    G.particles.push({ x: officer.x, y: officer.y, size: 3, color: '#ffd700', life: 0.1, max: 0.1 });
    if (!world.lineBlocked(officer.x, officer.y, targetPos.x, targetPos.y)) {
      player.hp -= player.inCar ? rng.range(1, 3) : rng.range(3, 7);
      G.shake = Math.max(G.shake, 2);
      spawnBurst(targetPos.x, targetPos.y, '#ff5b4d', 4);
    }
  }

  updateWanted(dt);
  updateExportActivity(G, dt, rng);

  G.respawnT -= dt;
  if (G.respawnT <= 0) {
    G.respawnT = 1.2;
    maintainDensity();
  }

  for (const particle of G.particles) {
    particle.life -= dt;
    if (particle.vx !== undefined) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
    }
  }
  G.particles = G.particles.filter((particle) => particle.life > 0);
  for (const floating of G.floatTexts) {
    floating.life -= dt;
    floating.y -= 22 * dt;
  }
  G.floatTexts = G.floatTexts.filter((floating) => floating.life > 0);
  for (const mark of G.skid) mark.life -= dt * 0.12;
  G.skid = G.skid.filter((mark) => mark.life > 0);

  if (!G.missions.started && currentMission(G.missions)) {
    G.missionDelay += dt;
    if (G.missionDelay > 2.5) {
      G.missionDelay = 0;
      startMission(G);
    }
  }
  updateMissions(G, dt);

  if (player.hp <= 0) {
    endRun('wasted');
    return;
  }

  // Camera: follows the player with velocity look-ahead while driving so
  // the road ahead — and whatever is chasing on it — stays in frame.
  const focus = G.playerPos();
  let lookX = 0;
  let lookY = 0;
  if (player.inCar && player.car) {
    lookX = Math.cos(player.car.angle) * player.car.speed * 0.42;
    lookY = Math.sin(player.car.angle) * player.car.speed * 0.42;
  }
  G.cam.x += (focus.x + lookX - G.cam.x) * Math.min(1, dt * 5);
  G.cam.y += (focus.y + lookY - G.cam.y) * Math.min(1, dt * 5);
  G.shake = Math.max(0, G.shake - dt * 30);

  input.endFrame();
}

function renderFrame() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (G.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  }
  ctx.translate(canvas.width / 2 - G.cam.x, canvas.height / 2 - G.cam.y);
  drawWorld(ctx, G, G.cam, G.time);
  ctx.restore();
  if (G.mode === 'play' || G.mode === 'pause' || G.mode === 'end') drawHUD(ctx, G);
}

// ---- screen flow ------------------------------------------------------------------------------

function startGame(fromSave) {
  audio.ensure();
  if (fromSave && G.save) {
    G.player.cash = G.save.cash || 150;
    G.missions.idx = Math.min(G.save.missionIdx || 0, MISSIONS.length - 1);
  }
  ui.hideTitle();
  ui.hideEnd();
  ui.hidePause();
  G.mode = 'play';
  G.missionDelay = 2.6;
  ui.dialogue(STORY_INTRO, 'MARA VOSS');
  ui.banner('SOLMAR BAY — steal a car, run the jobs');
}

function togglePause() {
  if (G.mode === 'play') {
    G.mode = 'pause';
    ui.showPause({ ...G.stats, exportsDone: G.exportsDone });
    audio.stopSiren();
  } else if (G.mode === 'pause') {
    G.mode = 'play';
    ui.hidePause();
  }
}

document.getElementById('new-game-btn').addEventListener('click', () => {
  G.save = null;
  startGame(false);
});
document.getElementById('continue-btn').addEventListener('click', () => startGame(true));
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('restart-btn').addEventListener('click', () => {
  ui.hidePause();
  G.mode = 'title';
  ui.showTitle(G.save);
});
document.getElementById('respawn-btn').addEventListener('click', respawn);
document.getElementById('title-btn').addEventListener('click', () => {
  ui.hideEnd();
  G.mode = 'title';
  ui.showTitle(G.save);
});
document.getElementById('mute-btn').addEventListener('click', () => {
  audio.ensure();
  const muted = audio.toggleMute();
  ui.banner(muted ? 'Muted' : 'Sound on');
});
window.addEventListener('keydown', (event) => {
  if ((event.code === 'KeyP' || event.code === 'Escape')
    && (G.mode === 'play' || G.mode === 'pause')) {
    togglePause();
  }
});

let lastTimestamp = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTimestamp) / 1000 || 0.016);
  lastTimestamp = now;
  update(dt);
  renderFrame();
  requestAnimationFrame(frame);
}

// ---- staging bridge ------------------------------------------------------------------------------
//
// staging.js stages screenshot scenes and runs the self-test, but the verbs
// it needs live here — so main hands over exactly this object and nothing
// else. The contract (names + behaviour) is part of the game's test surface.

const stagingHelpers = {
  startGame,
  tryEnterCar,
  exitCar,
  shoot,
  punch,
  update,
  spawnPoliceCar,
  makeOfficer,
  startMission: () => startMission(G),
  storyIntro: STORY_INTRO,
  saveBest: () => G.saveBest(),
  aimAtScreenOffset: (dx, dy) => {
    input.mouse.x = (G.player.x - G.cam.x) + canvas.width / 2 + dx;
    input.mouse.y = (G.player.y - G.cam.y) + canvas.height / 2 + dy;
  },
};

if (selftestMode) {
  G.mode = 'play';
  setTimeout(() => runSelfTest(G, stagingHelpers), 300);
} else if (shotName) {
  stageShot(G, stagingHelpers, shotName);
} else {
  ui.showTitle(G.save);
  const introEl = document.getElementById('story-line');
  if (introEl) introEl.textContent = STORY_INTRO;
}
requestAnimationFrame(frame);
