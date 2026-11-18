// SOLMAR BAY — the loop, screen flow, combat, wanted system, carjacking,
// save/load, the deterministic screenshot stager and the self-test.
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
  STORY_INTRO, MISSIONS, missionState, currentMission, currentStep,
  currentObjective, startMission, updateMissions,
  markExportCar, updateExportActivity, trySafehouseService,
} from './missions.js';
import { stageShot, runSelfTest } from './staging.js';
import { drawWorld } from './render.js';
import { UI, drawHUD } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const debugEl = document.getElementById('debug');

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';

const rng = new RNG(seed);
const world = createWorld(rng);
const input = new Input(canvas);
const audio = new AudioSys();
const ui = new UI(document);

const G = {
  mode: 'title', time: 0, seed, world, rng, input, audio, ui,
  player: {
    x: CFG.SPAWN.x, y: CFG.SPAWN.y, angle: -Math.PI / 2, hp: CFG.PLAYER_HP,
    cash: 150, ammo: CFG.START_AMMO, inCar: false, car: null,
    shootCd: 0, punchCd: 0, bustedT: 0, walkPhase: 0,
  },
  parked: [], traffic: [], peds: [], police: [], officers: [], roadblocks: [],
  skid: [], particles: [], floatTexts: [],
  heat: 0, lastSeenT: 0, decayT: 0,
  // Line-of-sight pursuit state: seenNow / lastSeen / searching drive the
  // police SEARCH phase, the minimap search ring and the HUD phase label.
  seenNow: false, lastSeen: null, unseenT: 0, searching: false, roadblockStars: 0,
  danger: null, dangerT: 0, // last gunshot/crash position civilians flee from
  exportCar: null, exportsDone: 0, gullT: 8, ambienceStarted: false,
  missions: missionState(),
  missionDelay: 0, policeSpawnT: 0, respawnT: 0,
  cam: { x: CFG.SPAWN.x, y: CFG.SPAWN.y }, shake: 0,
  errors: [], scriptInput: null, autopilot: false, autopilotTarget: null,
  save: null,
};

G.playerPos = () => (G.player.inCar && G.player.car)
  ? { x: G.player.car.x, y: G.player.car.y } : { x: G.player.x, y: G.player.y };
G.wantedStars = () => Math.min(5, Math.floor(G.heat / CFG.HEAT_PER_STAR));
G.addHeat = (n) => { G.heat = Math.min(CFG.MAX_HEAT, G.heat + n); G.lastSeenT = 0; };
G.setHeat = (n) => { G.heat = Math.max(0, Math.min(CFG.MAX_HEAT, n)); };
G.currentObjective = () => currentObjective(G.missions);
G.addPickupText = (x, y, text, color = '#fff') => {
  G.floatTexts.push({ x, y, text, color, life: 1.6 });
};
G.saveBest = () => {
  try {
    const prev = JSON.parse(localStorage.getItem('solmarbay-save') || 'null');
    const best = Math.max(G.player.cash, (prev && prev.bestCash) || 0);
    localStorage.setItem('solmarbay-save', JSON.stringify({
      cash: Math.floor(G.player.cash), missionIdx: G.missions.idx,
      bestCash: best, savedAt: Date.now(),
    }));
  } catch (e) { /* storage unavailable */ }
};
G.loadSave = () => {
  try { return JSON.parse(localStorage.getItem('solmarbay-save') || 'null'); } catch (e) { return null; }
};

// ---------- world population ----------
function populate() {
  G.parked = spawnParked(world, rng, 14);
  G.traffic = spawnTraffic(world, rng, 12);
  G.peds = spawnPeds(world, rng, 16);
  // The M4 repo coupe, parked in the east lot and marked.
  const repo = makeCar(2080, 1280, 0, '#f1c40f', 'coupe', 'parked');
  repo.isRepo = true;
  G.parked.push(repo);
  // A starter car on the road by the safehouse so M1 is always doable.
  G.parked.push(makeCar(560, 320, 0, '#c0392b', 'sedan', 'parked'));
  // One car is always marked for port export (the free-roam cash loop).
  markExportCar(G, rng);
}
populate();
G.save = G.loadSave();

// ---------- error collection (self-test reads this) ----------
window.addEventListener('error', (e) => { G.errors.push(String(e.message || e.error)); });
window.addEventListener('unhandledrejection', (e) => { G.errors.push('rejection: ' + String(e.reason)); });
const _cerr = console.error.bind(console);
console.error = (...a) => { G.errors.push(a.map(String).join(' ')); _cerr(...a); };

// ---------- car enter / exit / steal ----------
function nearestCar(px, py, maxD) {
  let best = null, bd = maxD;
  for (const c of [...G.parked, ...G.traffic]) {
    const d = Math.hypot(c.x - px, c.y - py);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function tryEnterCar() {
  const p = G.player;
  const c = nearestCar(p.x, p.y, 64);
  if (!c) { ui.banner('No car in reach — walk closer to one'); return false; }
  G.parked = G.parked.filter((x) => x !== c);
  G.traffic = G.traffic.filter((x) => x !== c);
  c.kind = 'player';
  p.car = c; p.inCar = true; p.angle = c.angle;
  audio.tone(300, 0.08, 'square', 0.1, 500);
  if (c.isRepo) ui.banner('Repo coupe secured — get it to the garage, scratch-free!');
  else if (c.isExport) ui.banner('Export car! Deliver it under the port crane for cash');
  else ui.banner(`${vehicleClass(c.model).label} — ${c.model === 'coupe' ? 'quick and loose' : c.model === 'truck' || c.model === 'van' ? 'heavy, slow, grippy' : 'balanced city ride'}`);
  return true;
}
function exitCar() {
  const p = G.player;
  if (!p.car) return;
  const c = p.car;
  p.x = c.x + Math.cos(c.angle + Math.PI / 2) * 30;
  p.y = c.y + Math.sin(c.angle + Math.PI / 2) * 30;
  p.angle = c.angle;
  c.kind = 'parked';
  G.parked.push(c);
  p.car = null; p.inCar = false;
}

// ---------- combat ----------
function shoot() {
  const p = G.player;
  if (p.shootCd > 0 || p.ammo <= 0 || p.inCar) return;
  p.shootCd = CFG.PISTOL_RATE; p.ammo -= 1;
  audio.shoot();
  // Aim from the player's screen position toward the mouse — exact even
  // while the camera is still settling (mouse is canvas-scaled in input.js).
  const ang = input.mouseAngleFrom(p.x, p.y, G.cam, canvas);
  p.angle = ang;
  // Gunfire is a danger source: nearby civilians flee from THIS point.
  G.danger = { x: p.x, y: p.y }; G.dangerT = 2.5;
  for (const pd of G.peds) if (Math.hypot(pd.x - p.x, pd.y - p.y) < 260) pd.flee = Math.max(pd.flee, 2.5);
  // Bullets are blocked by buildings: find the first wall along the line
  // and cap the effective range there (occlusion).
  let wallDist = CFG.PISTOL_RANGE;
  for (let d = 24; d < CFG.PISTOL_RANGE; d += 14) {
    if (world.pointInBuilding(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d)) { wallDist = d; break; }
  }
  const ex = p.x + Math.cos(ang) * wallDist;
  const ey = p.y + Math.sin(ang) * wallDist;
  // muzzle flash
  G.particles.push({ x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, size: 5, color: '#ffe600', life: 0.12, max: 0.12 });
  if (wallDist < CFG.PISTOL_RANGE) { // wall impact sparks where the round died
    G.particles.push({ x: ex, y: ey, size: 4, color: '#ffb347', life: 0.2, max: 0.2 });
  }
  // hitscan: nearest ped / officer / police car near the shot line,
  // never past the wall that blocks the bullet.
  let best = null, bd = 1e9;
  const consider = (o, r, kind) => {
    const dx = o.x - p.x, dy = o.y - p.y;
    const along = dx * Math.cos(ang) + dy * Math.sin(ang);
    if (along < 0 || along > wallDist) return;
    const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
    if (perp < r + 14 && along < bd) { bd = along; best = { o, kind }; }
  };
  for (const pd of G.peds) if (!pd.dead) consider(pd, 12, 'ped');
  for (const ofc of G.officers) consider(ofc, 12, 'officer');
  for (const pc of G.police) consider(pc, 18, 'policecar');
  if (best) {
    const { o, kind } = best;
    audio.hit();
    burst(o.x, o.y, '#ff5b4d', 8);
    o.hitFlash = 0.35; // visible hit reaction on every target type
    if (kind === 'ped') {
      o.hp -= CFG.PISTOL_DAMAGE;
      o.flee = 3;
      if (o.hp <= 0) { o.dead = true; G.addHeat(10); ui.banner('Pedestrian down — the heat rises'); }
    } else if (kind === 'officer') {
      o.hp -= CFG.PISTOL_DAMAGE;
      if (o.hp <= 0) { G.officers = G.officers.filter((x) => x !== o); G.addHeat(15); }
    } else {
      o.hp -= CFG.PISTOL_DAMAGE; o.damage = (o.damage || 0) + CFG.PISTOL_DAMAGE;
      if (o.hp <= 0) { o.speed = 0; o.targetSpeed = 0; burst(o.x, o.y, '#888', 16); G.addHeat(10); }
    }
  }
  // tracer
  G.particles.push({ x: ex, y: ey, size: 2, color: 'rgba(255,230,0,0.6)', life: 0.08, max: 0.08 });
}
function punch() {
  const p = G.player;
  if (p.punchCd > 0 || p.inCar) return;
  p.punchCd = CFG.PUNCH_RATE;
  audio.punch();
  for (const pd of G.peds) {
    if (pd.dead) continue;
    if (Math.hypot(pd.x - p.x, pd.y - p.y) < CFG.PUNCH_RANGE) {
      pd.hp -= CFG.PUNCH_DAMAGE; pd.flee = 3; pd.hitFlash = 0.35;
      G.danger = { x: p.x, y: p.y }; G.dangerT = 2;
      if (pd.hp <= 0) { pd.dead = true; G.addHeat(10); }
      return;
    }
  }
  for (const ofc of G.officers) {
    if (Math.hypot(ofc.x - p.x, ofc.y - p.y) < CFG.PUNCH_RANGE) {
      ofc.hp -= CFG.PUNCH_DAMAGE;
      if (ofc.hp <= 0) G.officers = G.officers.filter((x) => x !== ofc);
      G.addHeat(5);
      return;
    }
  }
}
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), sp = rng.range(40, 160);
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rng.range(2, 4), color, life: 0.5, max: 0.5 });
  }
}

// ---------- wanted / police: LOS pursuit → SEARCH → roadblocks ----------
function policeDesired() {
  const s = G.wantedStars();
  return { cars: s, officers: s >= 1 ? Math.min(3, s) : 0 };
}

// One vision test per frame, shared by every police unit: Mara is "seen"
// only inside sight range with a clear line (buildings break sight), or
// point-blank. Breaking sight starts the SEARCH phase.
export function computeVision(pos, dt = 1 / 60) {
  let seen = false;
  const units = [...G.police, ...G.officers, ...G.roadblocks];
  for (const u of units) {
    const d = Math.hypot(u.x - pos.x, u.y - pos.y);
    if (d < 70) { seen = true; break; }
    if (d <= CFG.SIGHT_RANGE && !world.lineBlocked(u.x, u.y, pos.x, pos.y)) { seen = true; break; }
  }
  if (seen) {
    G.seenNow = true; G.lastSeen = { x: pos.x, y: pos.y }; G.unseenT = 0;
  } else {
    G.seenNow = false; G.unseenT += dt;
  }
  G.searching = !seen && G.wantedStars() > 0 && !!G.lastSeen && G.unseenT > CFG.SEARCH_ENTER_TIME;
  return { seen, lastSeen: G.lastSeen };
}

function spawnRoadblocksIfNeeded(pos) {
  const stars = G.wantedStars();
  if (stars < CFG.ROADBLOCK_STARS) { G.roadblocks = []; G.roadblockStars = 0; return; }
  if (G.roadblockStars === stars && G.roadblocks.length >= 2) return;
  G.roadblockStars = stars;
  const angle = (G.player.inCar && G.player.car) ? G.player.car.angle : G.player.angle;
  const anchor = world.roadblockAhead(pos.x, pos.y, angle);
  G.roadblocks = [
    makeRoadblockCar(world, anchor.x - 16, anchor.y, angle + Math.PI / 2),
    makeRoadblockCar(world, anchor.x + 16, anchor.y + 10, angle + Math.PI / 2),
  ];
  if (stars >= 5) G.roadblocks.push(makeRoadblockCar(world, anchor.x, anchor.y - 26, angle + Math.PI / 2));
  ui.banner('ROADBLOCK ahead — break through or detour!');
}

function updateWanted(dt) {
  const pos = G.playerPos();
  const desired = policeDesired();
  G.policeSpawnT -= dt;
  if (G.police.length < desired.cars && G.policeSpawnT <= 0) {
    G.policeSpawnT = 1.2;
    const a = rng.range(0, Math.PI * 2);
    const raw = {
      x: Math.max(60, Math.min(world.w - 60, pos.x + Math.cos(a) * 520)),
      y: Math.max(60, Math.min(world.h - 60, pos.y + Math.sin(a) * 520)),
    };
    const snap = world.nearestRoadPoint(raw.x, raw.y); // spawn on a road, never inside a block
    const unit = spawnPoliceCar(world, snap.x, snap.y);
    if (G.lastSeen) unit.lastSeen = { ...G.lastSeen };
    G.police.push(unit);
  }
  if (G.officers.length < desired.officers && G.policeSpawnT <= 0) {
    const snap = world.nearestRoadPoint(pos.x + rng.range(-380, 380), pos.y + rng.range(-380, 380));
    G.officers.push(makeOfficer(9000 + G.officers.length + Math.floor(rng.range(0, 400)), snap.x, snap.y));
  }
  spawnRoadblocksIfNeeded(pos);
  // Heat decay: slow in the open, FAST while police are searching unseen.
  if (!G.seenNow && G.wantedStars() > 0) {
    G.decayT += dt;
    const rate = G.searching ? CFG.SEARCH_DECAY_RATE : CFG.DECAY_RATE;
    const delay = G.searching ? 0.8 : CFG.DECAY_DELAY;
    if (G.decayT > delay) G.heat = Math.max(0, G.heat - rate * dt);
  } else { G.decayT = 0; G.lastSeenT = 0; }
  if (G.wantedStars() === 0) {
    // heat gone: remaining units give up and drive off
    G.police = G.police.filter((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < 900);
    if (G.police.length === 0) G.officers = [];
    G.roadblocks = []; G.roadblockStars = 0; G.searching = false; G.lastSeen = null;
    audio.stopSiren();
  } else audio.startSiren();
}

// ---------- busted / wasted ----------
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
  const p = G.player;
  if (p.inCar && p.car) { p.car.kind = 'parked'; G.parked.push(p.car); p.car = null; }
  p.inCar = false;
  p.x = CFG.SAFEHOUSE.x; p.y = CFG.SAFEHOUSE.y; p.hp = CFG.PLAYER_HP;
  p.ammo = Math.max(p.ammo, CFG.START_AMMO);
  G.setHeat(0); G.police = []; G.officers = []; G.roadblocks = [];
  G.searching = false; G.lastSeen = null; G.unseenT = 0; audio.stopEngine();
  G.cam.x = p.x; G.cam.y = p.y;
  ui.hideEnd();
  G.mode = 'play';
  ui.banner('Back on the street — Delia is waiting');
}

// ---------- per-frame update ----------
function update(dt) {
  G.time += dt;
  ui.tick(dt);
  if (G.mode !== 'play') return;

  const p = G.player;
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  if (G.wantedStars() === 0 && p.hp < CFG.PLAYER_HP) p.hp = Math.min(CFG.PLAYER_HP, p.hp + 2 * dt);

  // Scripted / autopilot input overrides the real keyboard (shots + self-test).
  let mv = input.moveVec();
  if (G.scriptInput) mv = G.scriptInput;
  if (G.autopilot && p.inCar && p.car) {
    const tgt = G.autopilotTarget || { x: 1440, y: 1120 };
    const want = Math.atan2(tgt.y - p.car.y, tgt.x - p.car.x);
    let diff = want - p.car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    mv = { x: Math.max(-1, Math.min(1, diff * 2)), y: -1, handbrake: false };
    if (Math.hypot(tgt.x - p.car.x, tgt.y - p.car.y) < 120) {
      G.autopilotTarget = world.randomRoadPoint(rng);
    }
  }

  if (input.wasPressed('KeyM')) { const m = audio.toggleMute(); ui.banner(m ? 'Muted' : 'Sound on'); }

  if (p.inCar && p.car) {
    const res = driveCar(p.car, mv, dt, world, (spd) => {
      audio.crash(); G.shake = Math.min(14, spd / 40);
      burst(p.car.x, p.car.y, '#ffb347', 10);
      p.hp -= Math.max(2, spd / 60);
      G.danger = { x: p.car.x, y: p.car.y }; G.dangerT = 2;
      // Repo Job: dents in the marked coupe eat the careful-driving bonus.
      if (p.car.isRepo) G.missions.repoDamage += Math.max(1, spd / 90);
      p.car.damage = Math.min(100, (p.car.damage || 0) + spd / 22);
    });
    // Car-to-car impacts: traffic panics and swerves, both cars take damage.
    for (const other of [...G.traffic, ...G.parked]) {
      if (Math.abs(p.car.speed) > 90 && Math.hypot(other.x - p.car.x, other.y - p.car.y) < 40) {
        panicTrafficCar(other, p.car.x, p.car.y);
        audio.honk(); audio.crash();
        burst(other.x, other.y, '#ffb347', 6);
        p.car.speed *= 0.55; other.speed = (other.speed || 0) + 60;
        if (p.car.isRepo) G.missions.repoDamage += 2;
        G.danger = { x: other.x, y: other.y }; G.dangerT = 2;
      }
    }
    // Roadblocks are solid: hitting one hurts and slows Mara hard.
    for (const rb of G.roadblocks) {
      if (Math.hypot(rb.x - p.car.x, rb.y - p.car.y) < 42 && Math.abs(p.car.speed) > 60) {
        audio.crash(); G.shake = Math.max(G.shake, 8); p.hp -= 4;
        burst(rb.x, rb.y, '#9fb7ff', 8); p.car.speed *= -0.2;
      }
    }
    if (res.drifting) {
      const bx = p.car.x - Math.cos(p.car.angle) * 18, by = p.car.y - Math.sin(p.car.angle) * 18;
      G.skid.push({ x: bx, y: by, angle: p.car.angle, life: 1 });
      if (G.skid.length > 220) G.skid.shift();
    }
    // police rams damage the player
    for (const pc of G.police) {
      if (Math.hypot(pc.x - p.car.x, pc.y - p.car.y) < 44) {
        p.hp -= 5 * dt; G.shake = Math.max(G.shake, 3);
        pc.speed *= 0.6;
        if (Math.random() < dt * 2) burst(pc.x, pc.y, '#9fb7ff', 4);
      }
    }
    // exhaust puffs
    if (Math.abs(p.car.speed) > 60 && Math.random() < dt * 8) {
      G.particles.push({
        x: p.car.x - Math.cos(p.car.angle) * 24, y: p.car.y - Math.sin(p.car.angle) * 24,
        size: 3, color: 'rgba(200,200,200,0.5)', life: 0.4, max: 0.4,
      });
    }
  } else {
    // on foot
    const sp = input.down('ShiftLeft') || input.down('ShiftRight') ? CFG.RUN_SPEED : CFG.WALK_SPEED;
    const ox = p.x, oy = p.y;
    p.x += mv.x * sp * dt; p.y += mv.y * sp * dt;
    if (mv.x || mv.y) {
      p.angle = Math.atan2(mv.y, mv.x);
      p.walkPhase += dt * 10;
    }
    if (world.resolveCircle(p, CFG.PLAYER_R)) { /* bumped a wall */ }
    // police car running the player over
    for (const pc of G.police) {
      if (Math.hypot(pc.x - p.x, pc.y - p.y) < 30) { p.hp -= 12 * dt; G.shake = Math.max(G.shake, 4); }
    }
    // busted: an officer grabs Mara
    const nearOfficer = G.officers.find((o) => Math.hypot(o.x - p.x, o.y - p.y) < 28);
    if (nearOfficer) {
      p.bustedT += dt;
      if (p.bustedT > 1.2) { p.bustedT = 0; endRun('busted'); return; }
    } else p.bustedT = 0;
    if (input.mouse.down || input.mouse.clicked) shoot();
    if (input.wasPressed('Space') || input.wasPressed('KeyF')) punch();
  }

  if (input.wasPressed('KeyE')) {
    audio.ensure();
    if (p.inCar) exitCar(); else tryEnterCar();
  }
  if (input.wasPressed('KeyB')) { audio.ensure(); trySafehouseService(G); }

  // Ambience + engine hum (started lazily after the first user gesture)
  if (!G.ambienceStarted && audio.ctx) { audio.startAmbience(); G.ambienceStarted = true; }
  audio.updateEngine(p.inCar && p.car ? p.car.speed / CFG.CAR_MAX_SPEED : 0, !!(p.inCar && p.car));
  G.gullT -= dt;
  if (G.gullT <= 0) { G.gullT = rng.range(9, 20); if (audio.ctx && !audio.muted) audio.gull(); }

  // Vision is computed BEFORE the AI moves, so pursuit/search share it.
  const vision = computeVision(G.playerPos(), dt);
  G.dangerT = Math.max(0, G.dangerT - dt);
  const dangerNow = G.dangerT > 0 ? G.danger : null;

  // world life — density is kept up NEAR the player in the respawn step below
  const allCars = [...G.parked, ...G.traffic, ...G.police, ...G.roadblocks, ...(p.car ? [p.car] : [])];
  updateTraffic(G.traffic, world, dt, rng, allCars, G.peds);
  updatePeds(G.peds, world, dt, rng, dangerNow, allCars);
  updatePolice(G.police, G.playerPos(), dt, world, vision);
  updateOfficers(G.officers, G.playerPos(), dt, world, vision);
  // Officers return fire at range (flag set by their AI when LOS is clear)
  for (const o of G.officers) {
    if (!o.wantsFire) continue;
    o.wantsFire = false;
    audio.officerShot();
    const tp = G.playerPos();
    G.particles.push({ x: o.x, y: o.y, size: 3, color: '#ffd700', life: 0.1, max: 0.1 });
    if (!world.lineBlocked(o.x, o.y, tp.x, tp.y)) {
      p.hp -= p.inCar ? rng.range(1, 3) : rng.range(3, 7); // a car body soaks some of it
      G.shake = Math.max(G.shake, 2);
      burst(tp.x, tp.y, '#ff5b4d', 4);
    }
  }
  updateWanted(dt);
  updateExportActivity(G, dt, rng);

  // Keep the streets DENSE NEAR THE PLAYER: count only life within 700px,
  // top it up just outside view, and recycle anything stranded far away.
  G.respawnT -= dt;
  if (G.respawnT <= 0) {
    G.respawnT = 1.2;
    const pos = G.playerPos();
    const nearTraffic = G.traffic.filter((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < 700);
    if (nearTraffic.length < 7) {
      const c = spawnTraffic(world, rng, 1)[0];
      const snap = world.nearestRoadPoint(pos.x + rng.range(-620, 620), pos.y + rng.range(-620, 620));
      c.x = snap.x + rng.range(-12, 12); c.y = snap.y + rng.range(-12, 12);
      if (Math.hypot(c.x - pos.x, c.y - pos.y) > 420) G.traffic.push(c);
    }
    const nearPeds = G.peds.filter((x) => !x.dead && Math.hypot(x.x - pos.x, x.y - pos.y) < 650);
    if (nearPeds.length < 9) {
      const pd = spawnPeds(world, rng, 1)[0];
      pd.x = pos.x + rng.range(-520, 520); pd.y = pos.y + rng.range(-520, 520);
      if (!world.pointInBuilding(pd.x, pd.y) && Math.hypot(pd.x - pos.x, pd.y - pos.y) > 300) G.peds.push(pd);
    }
    // Recycle far-away life so the totals stay bounded while density holds.
    G.traffic = G.traffic.filter((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < 1500 || G.traffic.length <= 14);
    if (G.peds.length > 30) G.peds = G.peds.filter((x) => x.dead || Math.hypot(x.x - pos.x, x.y - pos.y) < 1200);
  }

  // particles + float texts + skid decay
  for (const pt of G.particles) {
    pt.life -= dt;
    if (pt.vx !== undefined) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.96; pt.vy *= 0.96; }
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
  for (const ft of G.floatTexts) { ft.life -= dt; ft.y -= 22 * dt; }
  G.floatTexts = G.floatTexts.filter((ft) => ft.life > 0);
  for (const s of G.skid) s.life -= dt * 0.12;
  G.skid = G.skid.filter((s) => s.life > 0);

  // missions
  if (!G.missions.started && currentMission(G.missions)) {
    G.missionDelay += dt;
    if (G.missionDelay > 2.5) { G.missionDelay = 0; startMission(G); }
  }
  updateMissions(G, dt);

  if (p.hp <= 0) { endRun('wasted'); return; }

  // Camera follows WITH LOOK-AHEAD: while driving it leans into the
  // velocity so the road ahead (and the chase) stays in frame; on foot it
  // leans a little toward the aim.
  const pos = G.playerPos();
  let lookX = 0, lookY = 0;
  if (p.inCar && p.car) {
    lookX = Math.cos(p.car.angle) * p.car.speed * 0.42;
    lookY = Math.sin(p.car.angle) * p.car.speed * 0.42;
  }
  const camTX = pos.x + lookX, camTY = pos.y + lookY;
  G.cam.x += (camTX - G.cam.x) * Math.min(1, dt * 5);
  G.cam.y += (camTY - G.cam.y) * Math.min(1, dt * 5);
  G.shake = Math.max(0, G.shake - dt * 30);

  input.endFrame();
}

function render() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (G.shake > 0.2) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  ctx.translate(canvas.width / 2 - G.cam.x, canvas.height / 2 - G.cam.y);
  drawWorld(ctx, G, G.cam, G.time);
  ctx.restore();
  if (G.mode === 'play' || G.mode === 'pause' || G.mode === 'end') drawHUD(ctx, G);
}

// ---------- screen flow ----------
function startGame(fromSave) {
  audio.ensure();
  if (fromSave && G.save) {
    G.player.cash = G.save.cash || 150;
    G.missions.idx = Math.min(G.save.missionIdx || 0, MISSIONS.length - 1);
  }
  ui.hideTitle(); ui.hideEnd(); ui.hidePause();
  G.mode = 'play';
  G.missionDelay = 2.6; // first mission briefs on the opening frame
  ui.dialogue(STORY_INTRO, 'MARA VOSS');
  ui.banner('SOLMAR BAY — steal a car, run the jobs');
}
function togglePause() {
  if (G.mode === 'play') { G.mode = 'pause'; ui.showPause(); audio.stopSiren(); }
  else if (G.mode === 'pause') { G.mode = 'play'; ui.hidePause(); }
}

document.getElementById('new-game-btn').addEventListener('click', () => { G.save = null; startGame(false); });
document.getElementById('continue-btn').addEventListener('click', () => startGame(true));
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('restart-btn').addEventListener('click', () => { ui.hidePause(); G.mode = 'title'; ui.showTitle(G.save); });
document.getElementById('respawn-btn').addEventListener('click', respawn);
document.getElementById('title-btn').addEventListener('click', () => { ui.hideEnd(); G.mode = 'title'; ui.showTitle(G.save); });
document.getElementById('mute-btn').addEventListener('click', () => { audio.ensure(); const m = audio.toggleMute(); ui.banner(m ? 'Muted' : 'Sound on'); });
window.addEventListener('keydown', (e) => {
  if ((e.code === 'KeyP' || e.code === 'Escape') && (G.mode === 'play' || G.mode === 'pause')) togglePause();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------- staging + self-test live in staging.js ----------
// main.js hands staging the verbs it needs; staging stages scenes and
// drives the scripted play-through through these exact functions.
const stagingHelpers = {
  startGame, tryEnterCar, exitCar, shoot, punch, update,
  spawnPoliceCar, makeOfficer, startMission: () => startMission(G),
  storyIntro: STORY_INTRO,
  saveBest: () => G.saveBest(),
  aimAtScreenOffset: (dx, dy) => {
    input.mouse.x = (G.player.x - G.cam.x) + canvas.width / 2 + dx;
    input.mouse.y = (G.player.y - G.cam.y) + canvas.height / 2 + dy;
  },
};

// ---------- boot ----------
if (selftest) {
  G.mode = 'play'; // self-test drives update() directly
  setTimeout(() => runSelfTest(G, stagingHelpers), 300);
} else if (shot) {
  stageShot(G, stagingHelpers, shot);
} else {
  ui.showTitle(G.save);
  const intro = document.getElementById('story-line');
  if (intro) intro.textContent = STORY_INTRO;
}
requestAnimationFrame(frame);
