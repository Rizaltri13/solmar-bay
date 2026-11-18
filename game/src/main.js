// SOLMAR BAY — the loop, screen flow, combat, wanted system, carjacking,
// save/load, the deterministic screenshot stager and the self-test.
import { CFG } from './config.js';
import { RNG } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { createWorld } from './world.js';
import {
  makeCar, spawnParked, spawnTraffic, spawnPeds, spawnPoliceCar,
  driveCar, updateTraffic, updatePeds, updatePolice, updateOfficers,
} from './entities.js';
import {
  STORY_INTRO, MISSIONS, missionState, currentMission, currentStep,
  currentObjective, startMission, updateMissions,
} from './missions.js';
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
  parked: [], traffic: [], peds: [], police: [], officers: [],
  skid: [], particles: [], floatTexts: [],
  heat: 0, lastSeenT: 0, decayT: 0,
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
  if (c.isRepo) ui.banner('Repo coupe secured — get it to the garage!');
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
  // while the camera is still settling.
  const psx = p.x - G.cam.x + canvas.width / 2;
  const psy = p.y - G.cam.y + canvas.height / 2;
  const ang = Math.atan2(input.mouse.y - psy, input.mouse.x - psx);
  p.angle = ang;
  const ex = p.x + Math.cos(ang) * CFG.PISTOL_RANGE;
  const ey = p.y + Math.sin(ang) * CFG.PISTOL_RANGE;
  // muzzle flash
  G.particles.push({ x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, size: 5, color: '#ffe600', life: 0.12, max: 0.12 });
  // hitscan: nearest ped / officer / police car near the shot line
  let best = null, bd = 1e9;
  const consider = (o, r, kind) => {
    const dx = o.x - p.x, dy = o.y - p.y;
    const along = dx * Math.cos(ang) + dy * Math.sin(ang);
    if (along < 0 || along > CFG.PISTOL_RANGE) return;
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
    if (kind === 'ped') {
      o.hp -= CFG.PISTOL_DAMAGE;
      o.flee = 3;
      if (o.hp <= 0) { o.dead = true; G.addHeat(10); ui.banner('Pedestrian down — the heat rises'); }
    } else if (kind === 'officer') {
      o.hp -= CFG.PISTOL_DAMAGE;
      if (o.hp <= 0) { G.officers = G.officers.filter((x) => x !== o); G.addHeat(15); }
    } else {
      o.hp -= CFG.PISTOL_DAMAGE;
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
      pd.hp -= CFG.PUNCH_DAMAGE; pd.flee = 3;
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

// ---------- wanted / police ----------
function policeDesired() {
  const s = G.wantedStars();
  return { cars: s, officers: s >= 1 ? Math.min(3, s) : 0 };
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
    G.police.push(spawnPoliceCar(world, snap.x, snap.y));
  }
  if (G.officers.length < desired.officers && G.policeSpawnT <= 0) {
    G.officers.push({
      id: 9000 + G.officers.length, x: pos.x + rng.range(-380, 380), y: pos.y + rng.range(-380, 380),
      angle: 0, hp: 60,
    });
  }
  // Hidden? decay heat when no police can see the player.
  const nearestPolice = Math.min(
    ...G.police.map((c) => Math.hypot(c.x - pos.x, c.y - pos.y)), 1e9,
    ...G.officers.map((o) => Math.hypot(o.x - pos.x, o.y - pos.y)), 1e9,
  );
  if (nearestPolice > 380) {
    G.decayT += dt;
    if (G.decayT > CFG.DECAY_DELAY) G.heat = Math.max(0, G.heat - CFG.DECAY_RATE * dt);
  } else { G.decayT = 0; G.lastSeenT = 0; }
  if (G.wantedStars() === 0) {
    // heat gone: remaining units give up and drive off
    G.police = G.police.filter((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < 900);
    if (G.police.length === 0) G.officers = [];
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
  G.setHeat(0); G.police = []; G.officers = [];
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
    });
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

  // world life
  const allCars = [...G.parked, ...G.traffic, ...G.police, ...(p.car ? [p.car] : [])];
  updateTraffic(G.traffic, world, dt, rng, allCars);
  updatePeds(G.peds, world, dt, rng, null);
  updatePolice(G.police, G.playerPos(), dt, world);
  updateOfficers(G.officers, G.playerPos(), dt, world);
  updateWanted(dt);

  // keep the streets populated
  G.respawnT -= dt;
  if (G.respawnT <= 0) {
    G.respawnT = 2;
    const pos = G.playerPos();
    if (G.traffic.length < 12) {
      const c = spawnTraffic(world, rng, 1)[0];
      if (Math.hypot(c.x - pos.x, c.y - pos.y) > 500) G.traffic.push(c);
    }
    if (G.peds.filter((x) => !x.dead).length < 14) {
      const pd = spawnPeds(world, rng, 1)[0];
      if (Math.hypot(pd.x - pos.x, pd.y - pos.y) > 400) G.peds.push(pd);
    }
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

  // camera follows, with shake
  const pos = G.playerPos();
  G.cam.x += (pos.x - G.cam.x) * Math.min(1, dt * 5);
  G.cam.y += (pos.y - G.cam.y) * Math.min(1, dt * 5);
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

// ---------- deterministic screenshot staging ----------
function stageShot(name) {
  // Every shot is built through the game's own systems, then held.
  if (name === 'title') {
    G.mode = 'title'; ui.showTitle(null);
    const intro = document.getElementById('story-line');
    if (intro) intro.textContent = STORY_INTRO;
    return;
  }
  startGame(false);
  if (name === 'chase') {
    // Mara mid-chase: driving, 3 stars, two police cars closing in.
    const car = G.parked.find((c) => !c.isRepo) || G.parked[0];
    G.player.x = car.x; G.player.y = car.y;
    tryEnterCar();
    G.player.car.x = 1280; G.player.car.y = 960; G.player.car.angle = 0; G.player.car.speed = 380;
    G.setHeat(3 * CFG.HEAT_PER_STAR);
    G.police.push(spawnPoliceCar(world, 1000, 960));
    G.police.push(spawnPoliceCar(world, 1040, 960));
    G.police.push(spawnPoliceCar(world, 1440, 960));
    G.missions.idx = 2; G.missions.step = 0; G.missions.started = true;
    G.autopilot = true; G.autopilotTarget = { x: 1920, y: 960 };
    G.cam.x = G.player.car.x; G.cam.y = G.player.car.y;
  } else if (name === 'mission') {
    // Courier run in progress: Mara driving toward the marina drop.
    const car = G.parked.find((c) => !c.isRepo) || G.parked[0];
    G.player.x = car.x; G.player.y = car.y;
    tryEnterCar();
    G.player.car.x = 1280; G.player.car.y = 960; G.player.car.angle = Math.PI / 2; G.player.car.speed = 300;
    G.missions.idx = 1; G.missions.step = 0; G.missions.started = true; G.missions.timer = 74;
    G.autopilot = true; G.autopilotTarget = { x: 1920, y: 960 };
    G.cam.x = G.player.car.x; G.cam.y = G.player.car.y;
  } else if (name === 'foot') {
    // On foot on a busy street: traffic, pedestrians, one star, officer closing.
    // (Away from Delia's corner so M1 does not auto-complete on staging.)
    G.player.x = 960; G.player.y = 960; G.player.angle = 0;
    G.player.ammo = 18;
    G.setHeat(1 * CFG.HEAT_PER_STAR);
    G.officers.push({ id: 9001, x: 1020, y: 1000, angle: Math.PI, hp: 60 });
    G.missions.idx = 0; G.missions.step = 1; G.missions.started = true;
    // pull a few pedestrians and a traffic car into frame
    for (let i = 0; i < 4; i++) {
      const pd = G.peds[i];
      if (pd) { pd.x = 900 + i * 46; pd.y = 1010; pd.dead = false; }
    }
    const tc = G.traffic[0];
    if (tc) { tc.x = 800; tc.y = 960; tc.angle = 0; tc.speed = 60; }
    G.cam.x = G.player.x; G.cam.y = G.player.y;
  }
  // Staged shots hold the scene: no story dialogue over the frame.
  G.ui.dialogueEl.classList.add('hidden');
  G.ui._dialogueT = 0;
  ui.banner(currentObjective(G.missions).text);
}

// ---------- scripted self-test ----------
function runSelfTest() {
  const results = {};
  const step = (n) => { for (let i = 0; i < n; i++) update(1 / 60); };
  try {
    startGame(false);
    results.started = G.mode === 'play';
    step(60);
    // walk to the starter car and jack it
    const car = G.parked[G.parked.length - 1];
    const sx = car.x, sy = car.y;
    G.player.x = car.x; G.player.y = car.y;
    results.enterCar = tryEnterCar();
    G.scriptInput = { x: 0, y: -1, handbrake: false };
    step(240); // drive ~4s
    results.drove = Math.abs(G.player.car.speed) > 50;
    results.carMoved = Math.hypot(G.player.car.x - sx, G.player.car.y - sy) > 50;
    // trigger a 2-star chase (60 heat: safely above the 50 boundary)
    G.addHeat(60);
    step(240);
    results.wanted = G.wantedStars();
    results.policeSpawned = G.police.length > 0;
    results.officersSpawned = G.officers.length > 0;
    // finish M1: drive to Delia's corner
    G.player.car.x = CFG.DELIA.x; G.player.car.y = CFG.DELIA.y; G.player.car.speed = 0;
    G.scriptInput = null;
    step(30);
    results.missionAdvanced = G.missions.idx >= 1;
    results.missionObjective = currentObjective(G.missions).text;
    // on-foot combat: exit, shoot at a pedestrian placed in front of Mara
    exitCar();
    G.player.angle = 0;
    const pd = G.peds.find((x) => !x.dead) || G.peds[0];
    pd.x = G.player.x + 120; pd.y = G.player.y; pd.hp = 30;
    // Aim the mouse exactly along the player->pedestrian line.
    input.mouse.x = (G.player.x - G.cam.x) + canvas.width / 2 + 120;
    input.mouse.y = (G.player.y - G.cam.y) + canvas.height / 2;
    G.player.shootCd = 0;
    shoot();
    results.shotFired = G.player.ammo < CFG.START_AMMO;
    results.targetHit = pd.hp < 30;
    // punch + wanted decay + save
    G.player.punchCd = 0; punch();
    G.setHeat(0); step(120);
    G.saveBest();
    results.saveWritten = !!localStorage.getItem('solmarbay-save');
    results.finalCash = Math.floor(G.player.cash);
    results.errors = G.errors;
    results.pass = results.started && results.enterCar && results.drove && results.carMoved &&
      results.wanted >= 2 && results.policeSpawned && results.missionAdvanced &&
      results.shotFired && results.targetHit && results.saveWritten && G.errors.length === 0;
  } catch (e) {
    G.errors.push('selftest exception: ' + (e && e.message));
    results.pass = false; results.errors = G.errors;
  }
  const label = (results.pass ? 'SELFTEST PASS' : 'SELFTEST FAIL') +
    ' missionIdx=' + G.missions.idx + ' wanted=' + G.wantedStars() +
    ' police=' + G.police.length + ' errors=' + G.errors.length;
  document.title = label;
  debugEl.textContent = JSON.stringify(results);
  debugEl.dataset.done = '1';
}

// ---------- boot ----------
if (selftest) {
  G.mode = 'play'; // self-test drives update() directly
  setTimeout(runSelfTest, 300);
} else if (shot) {
  stageShot(shot);
} else {
  ui.showTitle(G.save);
  const intro = document.getElementById('story-line');
  if (intro) intro.textContent = STORY_INTRO;
}
requestAnimationFrame(frame);
