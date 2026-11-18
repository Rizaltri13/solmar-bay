// SOLMAR BAY — deterministic screenshot staging + the scripted self-test.
// Extracted from main.js: main owns the loop and the game state (G); this
// module only stages scenes THROUGH the game's own systems (entering cars,
// setting heat, starting missions) and drives a scripted play-through.
// Nothing here runs during normal play.
import { CFG } from './config.js';
import { currentObjective } from './missions.js';

// Stage one named screenshot scene and hold it. helpers = the verbs main.js
// exposes (startGame, tryEnterCar, spawnPoliceCar, makeOfficer).
export function stageShot(G, helpers, name) {
  const { world, ui } = G;
  if (name === 'title') {
    G.mode = 'title'; ui.showTitle(null);
    const intro = document.getElementById('story-line');
    if (intro) intro.textContent = helpers.storyIntro;
    return;
  }
  helpers.startGame(false);
  if (name === 'chase') {
    stageChaseShot(G, helpers);
  } else if (name === 'mission') {
    stageMissionShot(G, helpers);
  } else if (name === 'foot') {
    stageFootShot(G, helpers);
  }
  // Staged shots hold the scene: no story dialogue over the frame.
  G.ui.dialogueEl.classList.add('hidden');
  G.ui._dialogueT = 0;
  ui.banner(currentObjective(G.missions).text);
}

function enterStarterCar(G, helpers) {
  // Prefer a sedan/coupe for the staged drive — it reads as Mara's ride.
  const car = G.parked.find((c) => !c.isRepo && (c.model === 'sedan' || c.model === 'coupe')) ||
    G.parked.find((c) => !c.isRepo) || G.parked[0];
  G.player.x = car.x; G.player.y = car.y;
  helpers.tryEnterCar();
  return G.player.car;
}

// Cover: driving mid-chase through a dressed district — palms + signs in
// frame, 3 stars, police closing, traffic + pedestrians, route + minimap.
export function stageChaseShot(G, helpers) {
  const car = enterStarterCar(G, helpers);
  // On the Palm Heights / downtown road: palms line this stretch.
  car.x = 1280; car.y = 1280; car.angle = 0; car.speed = 380;
  G.setHeat(3 * CFG.HEAT_PER_STAR);
  G.lastSeen = { x: car.x, y: car.y };
  G.police.push(helpers.spawnPoliceCar(G.world, 1010, 1280));
  G.police.push(helpers.spawnPoliceCar(G.world, 1060, 1330));
  G.police.push(helpers.spawnPoliceCar(G.world, 1470, 1280));
  for (const pc of G.police) pc.angle = 0;
  G.missions.idx = 2; G.missions.step = 0; G.missions.started = true;
  G.autopilot = true; G.autopilotTarget = { x: 1920, y: 1280 };
  pullCrowdIntoFrame(G, car.x, car.y);
  G.cam.x = car.x; G.cam.y = car.y;
}

// Mission in progress: Courier Run, package on board, heading to a drop.
export function stageMissionShot(G, helpers) {
  const car = enterStarterCar(G, helpers);
  car.x = 1280; car.y = 960; car.angle = Math.PI / 2; car.speed = 300;
  G.missions.idx = 1; G.missions.step = 1; G.missions.started = true;
  G.missions.timer = 74; G.missions.packages = 1;
  G.autopilot = true; G.autopilotTarget = { x: 1920, y: 960 };
  pullCrowdIntoFrame(G, car.x, car.y);
  G.cam.x = car.x; G.cam.y = car.y;
}

// On foot: Mara aiming on a busy street, one star, an officer closing in
// who will return fire at range instead of only rushing for the grab.
export function stageFootShot(G, helpers) {
  G.player.x = 960; G.player.y = 960; G.player.angle = 0;
  G.player.ammo = 18;
  G.setHeat(1 * CFG.HEAT_PER_STAR);
  G.lastSeen = { x: G.player.x, y: G.player.y };
  G.officers.push(helpers.makeOfficer(9001, 1040, 1005));
  G.missions.idx = 0; G.missions.step = 1; G.missions.started = true;
  pullCrowdIntoFrame(G, G.player.x, G.player.y);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
}

// Make sure traffic + pedestrians are visibly in the staged frame.
export function pullCrowdIntoFrame(G, cx, cy) {
  for (let i = 0; i < 5; i++) {
    const pd = G.peds[i];
    if (pd) { pd.x = cx - 220 + i * 52; pd.y = cy + 52 + (i % 2) * 22; pd.dead = false; pd.hp = 30; }
  }
  const tc = G.traffic[0];
  if (tc) { tc.x = cx - 300; tc.y = cy; tc.angle = 0; tc.speed = 60; }
  const tc2 = G.traffic[1];
  if (tc2) { tc2.x = cx + 330; tc2.y = cy - 6; tc2.angle = Math.PI; tc2.speed = 50; }
}

// ---------- scripted self-test (?selftest=1) ----------
// Drives the real update() loop: enter a car, drive, wanted chase, mission
// step, pistol, PLUS the new systems — police SEARCH phase after breaking
// line of sight, the port vehicle-export payout, and the courier pickup
// chain. Reports PASS/FAIL in the page title + #debug JSON.
export function runSelfTest(G, helpers) {
  const { world } = G;
  const results = {};
  const step = (n) => { for (let i = 0; i < n; i++) helpers.update(1 / 60); };
  try {
    helpers.startGame(false);
    results.started = G.mode === 'play';
    step(60);
    // walk to the starter car and jack it
    const car = G.parked[G.parked.length - 1];
    const sx = car.x, sy = car.y;
    G.player.x = car.x; G.player.y = car.y;
    results.enterCar = helpers.tryEnterCar();
    results.vehicleClass = G.player.car ? G.player.car.model : null;
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
    helpers.exitCar();
    G.player.angle = 0;
    const pd = G.peds.find((x) => !x.dead) || G.peds[0];
    pd.x = G.player.x + 120; pd.y = G.player.y; pd.hp = 30; pd.hitFlash = 0;
    helpers.aimAtScreenOffset(120, 0);
    G.player.shootCd = 0;
    helpers.shoot();
    results.shotFired = G.player.ammo < CFG.START_AMMO;
    results.targetHit = pd.hp < 30;
    results.hitReaction = pd.hitFlash > 0 || pd.flee > 0;
    // bullet occlusion: a shot fired INTO a building must not hit past it
    const b = world.buildings[0];
    if (b) {
      G.player.x = b.x - 60; G.player.y = b.y + b.h / 2; G.player.angle = 0;
      const behind = G.peds.find((x) => !x.dead && x !== pd) || G.peds[1];
      behind.x = b.x + b.w + 60; behind.y = G.player.y; behind.hp = 30;
      helpers.aimAtScreenOffset(300, 0);
      G.player.shootCd = 0; G.player.ammo = Math.max(G.player.ammo, 6);
      helpers.shoot();
      results.bulletBlockedByBuilding = behind.hp >= 30;
    }
    // --- NEW: police SEARCH phase after breaking line of sight ---
    results.searchPhase = testSearchPhase(G, helpers, step);
    // --- NEW: vehicle export pays out at the port crane ---
    results.exportPaid = testExportDelivery(G, helpers, step);
    // --- NEW: courier pickup chain advances and counts the package ---
    results.courierPickupChain = testCourierPickup(G, helpers, step);
    // punch + wanted clear + save
    G.player.punchCd = 0; helpers.punch();
    G.setHeat(0); G.police = []; G.officers = []; G.roadblocks = [];
    step(120);
    helpers.saveBest();
    results.saveWritten = !!localStorage.getItem('solmarbay-save');
    results.finalCash = Math.floor(G.player.cash);
    results.errors = G.errors;
    results.pass = results.started && results.enterCar && results.drove && results.carMoved &&
      results.wanted >= 2 && results.policeSpawned && results.missionAdvanced &&
      results.shotFired && results.targetHit && results.saveWritten &&
      results.searchPhase && results.exportPaid && results.courierPickupChain &&
      G.errors.length === 0;
  } catch (e) {
    G.errors.push('selftest exception: ' + (e && e.message));
    results.pass = false; results.errors = G.errors;
  }
  const label = (results.pass ? 'SELFTEST PASS' : 'SELFTEST FAIL') +
    ' missionIdx=' + G.missions.idx + ' wanted=' + G.wantedStars() +
    ' police=' + G.police.length + ' errors=' + G.errors.length;
  document.title = label;
  const debugEl = document.getElementById('debug');
  if (debugEl) { debugEl.textContent = JSON.stringify(results); debugEl.dataset.done = '1'; }
  return results;
}

// Be seen up close, then vanish across the map: police must enter SEARCH.
export function testSearchPhase(G, helpers, step) {
  try {
    if (!G.player.inCar) {
      const c = G.parked[G.parked.length - 1] || G.traffic[0];
      if (!c) return false;
      G.player.x = c.x; G.player.y = c.y; helpers.tryEnterCar();
    }
    G.player.car.x = CFG.PORT_CRANE.x; G.player.car.y = CFG.PORT_CRANE.y - 140; G.player.car.speed = 0;
    G.setHeat(3 * CFG.HEAT_PER_STAR);
    const unit = helpers.spawnPoliceCar(G.world, G.player.car.x - 120, G.player.car.y);
    G.police = [unit]; G.officers = [];
    step(20); // close + open ground: they see Mara
    const wasSeen = !!G.lastSeen && !G.searching;
    // Vanish: teleport across the map, far beyond sight range. Keep ONLY
    // the original unit in play (fresh spawns would spawn near Mara and
    // legitimately re-acquire her, which is the game working, not SEARCH).
    G.player.car.x = CFG.BANK.x; G.player.car.y = CFG.BANK.y; G.player.car.speed = 0;
    for (let i = 0; i < 15; i++) {
      G.policeSpawnT = 5; // hold reinforcements: this test isolates ONE unit's vision
      step(10);
      G.police = G.police.filter((c) => c === unit);
      G.officers = [];
      G.setHeat(Math.max(G.heat, 30)); // keep ≥1 star so the phase stays observable
    }
    return wasSeen && G.searching === true && G.wantedStars() >= 1 &&
      unit.policeState === 'search';
  } catch (e) { G.errors.push('search test: ' + (e && e.message)); return false; }
}

// Drive the marked export car under the port crane: cash must increase.
export function testExportDelivery(G, helpers, step) {
  try {
    G.setHeat(0); G.police = []; G.officers = [];
    if (G.player.inCar) helpers.exitCar();
    const target = G.parked.find((c) => !c.isRepo) || G.parked[0];
    if (!target) return false;
    target.isExport = true; G.exportCar = target;
    G.player.x = target.x; G.player.y = target.y;
    if (!helpers.tryEnterCar()) return false;
    const cashBefore = G.player.cash;
    G.player.car.x = CFG.PORT_CRANE.x; G.player.car.y = CFG.PORT_CRANE.y; G.player.car.speed = 0;
    step(30);
    return G.player.cash > cashBefore && (G.exportsDone || 0) >= 1 && !G.player.inCar;
  } catch (e) { G.errors.push('export test: ' + (e && e.message)); return false; }
}

// Courier Run step 1 is a PICKUP: reaching it must count a package + advance.
export function testCourierPickup(G, helpers, step) {
  try {
    G.missions.idx = 1; G.missions.step = 0; G.missions.started = false; G.missions.packages = 0;
    helpers.startMission();
    const obj = currentObjective(G.missions);
    if (!obj.target) return false;
    const pos = G.playerPos();
    if (G.player.inCar && G.player.car) { G.player.car.x = obj.target.x; G.player.car.y = obj.target.y; G.player.car.speed = 0; }
    else { G.player.x = obj.target.x; G.player.y = obj.target.y; }
    void pos;
    step(30);
    return G.missions.packages >= 1 && G.missions.step >= 1;
  } catch (e) { G.errors.push('courier test: ' + (e && e.message)); return false; }
}
