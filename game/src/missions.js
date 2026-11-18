// Story + the 5 missions. Each mission is a small step machine:
// a step has an objective text, a target point, and a radius. update()
// advances steps, hands out rewards, and talks through Delia Rook.
import { CFG } from './config.js';

export const STORY_INTRO =
  'Solmar Bay, 2026. Mara Voss drove getaway for the wrong crew once — ' +
  'never again. Now she drives for Delia Rook, the fixer who runs this ' +
  'sun-bleached port city from a payphone and a smile. Five jobs. ' +
  'One big score. Stay out of the cuffs.';

export const MISSIONS = [
  {
    id: 'm1', title: 'First Wheels',
    briefing: 'DELIA: "You need wheels before you need a plan, Mara. Jack a car — any car — then bring it to my corner."',
    steps: [
      { text: 'Steal a car (walk up to one and press E)', target: null, radius: 0, kind: 'steal' },
      { text: 'Drive to Delia\'s corner', target: () => CFG.DELIA, radius: 70, kind: 'reach' },
    ],
  },
  {
    id: 'm2', title: 'Courier Run',
    briefing: 'DELIA: "No package, no payday. Pick up at the bakery, drop at the marina. Pick up at the garage, drop at the port gate. Last parcel rides to the north arcade. One clock — move."',
    steps: [
      { text: 'Pick up package 1 at the Palm Heights bakery', target: () => ({ x: 960, y: 640 }), radius: 70, kind: 'pickup', timer: 150 },
      { text: 'Drop 1/3: the marina kiosk', target: () => ({ x: 1920, y: 960 }), radius: 70, kind: 'reach' },
      { text: 'Pick up package 2 at the garage', target: () => CFG.GARAGE, radius: 70, kind: 'pickup' },
      { text: 'Drop 2/3: the port gate', target: () => ({ x: 320, y: 1600 }), radius: 70, kind: 'reach' },
      { text: 'Drop 3/3: the north arcade (final parcel is on board)', target: () => ({ x: 1280, y: 320 }), radius: 70, kind: 'reach' },
    ],
  },
  {
    id: 'm3', title: 'Heat',
    briefing: 'DELIA: "A patrol made your plate. Two stars, Mara. Lose them and get to the safehouse — don\'t bring the law to my door."',
    steps: [
      { text: 'Escape the 2-star chase — reach the safehouse', target: () => CFG.SAFEHOUSE, radius: 80, kind: 'escape', wanted: 2 },
    ],
  },
  {
    id: 'm4', title: 'Repo Job',
    briefing: 'DELIA: "A coupe in the east lot skipped three payments. It\'s ours now. Bring it to the garage, scratch-free if you can."',
    steps: [
      { text: 'Steal the marked coupe in the east lot', target: () => ({ x: 2080, y: 1280 }), radius: 90, kind: 'repo' },
      { text: 'Deliver the coupe to the garage', target: () => CFG.GARAGE, radius: 80, kind: 'deliver' },
    ],
  },
  {
    id: 'm5', title: 'The Big Score',
    briefing: 'DELIA: "The Bay Federal vault. Two locks: crack the door, then hold the vault while it cycles. The second lock trips the alarm — then you lose a three-star chase to the hideout. This is the one we retire on."',
    steps: [
      { text: 'Reach Bay Federal bank', target: () => CFG.BANK, radius: 80, kind: 'reach' },
      { text: 'Vault lock 1/2 — hold at the vault door', target: () => CFG.BANK, radius: 80, kind: 'vault', hold: 2.5, vaultStage: 1 },
      { text: 'Vault lock 2/2 — hold while the vault cycles (alarm armed!)', target: () => CFG.BANK, radius: 80, kind: 'vault', hold: 3.5, vaultStage: 2, alarm: true },
      // No 'wanted' here: the vault alarm already set exactly 3 stars.
      { text: 'Escape the 3-star chase — reach the hideout', target: () => CFG.HIDEOUT, radius: 80, kind: 'escape' },
    ],
  },
];

export function missionState() {
  return {
    idx: 0, step: 0, timer: 0, holdT: 0, done: false, storyDone: false, started: false,
    packages: 0, // courier parcels currently on board
    repoDamage: 0, // damage taken while driving the repo coupe (cuts the bonus)
    vaultStage: 0, // bank vault locks cracked so far
  };
}

export function currentMission(ms) {
  return ms.idx < MISSIONS.length ? MISSIONS[ms.idx] : null;
}

export function currentStep(ms) {
  const m = currentMission(ms);
  return m ? m.steps[ms.step] : null;
}

export function currentObjective(ms) {
  const m = currentMission(ms);
  if (!m) return { text: 'Free roam — Solmar Bay is yours. Missions complete!', target: null };
  const s = m.steps[ms.step];
  return { text: `${m.title}: ${s.text}`, target: s.target ? s.target() : null, step: s };
}

// Called when a mission starts: applies its opening effect (wanted, timers).
export function startMission(G) {
  const ms = G.missions;
  const m = currentMission(ms);
  if (!m) return;
  ms.started = true; ms.step = 0; ms.timer = 0; ms.holdT = 0;
  const s = m.steps[0];
  if (s.timer) ms.timer = s.timer;
  if (s.wanted) G.addHeat(s.wanted * CFG.HEAT_PER_STAR);
  G.ui.dialogue(m.briefing, 'DELIA ROOK');
  G.ui.banner(`${m.title} — ${m.id.toUpperCase()}`);
  G.audio.mission();
}

function completeMission(G) {
  const ms = G.missions;
  const m = currentMission(ms);
  let reward = CFG.MISSION_REWARDS[ms.idx] || 500;
  // Repo Job careful-driving bonus: every dent in the coupe cuts the payout.
  if (m && m.id === 'm4') {
    const bonusCut = Math.min(1000, Math.round(ms.repoDamage * 10));
    reward = Math.max(500, reward - bonusCut);
    if (bonusCut > 0) G.ui.dialogue(`DELIA: "Scratches cost money, Mara. -$${bonusCut} off the repo fee."`, 'DELIA ROOK');
    else G.ui.dialogue('DELIA: "Scratch-free. Full fee, plus my respect."', 'DELIA ROOK');
  }
  G.player.cash += reward;
  G.player.ammo = Math.max(G.player.ammo, CFG.START_AMMO);
  G.ui.banner(`Job done — +$${reward}`);
  // The repo job already spoke its scratch verdict above; don't talk over it.
  if (!(m && m.id === 'm4')) {
    G.ui.dialogue(`DELIA: "Clean work, Mara. $${reward} is yours. Next job when you're ready."`, 'DELIA ROOK');
  }
  G.audio.mission();
  G.addPickupText(G.player.x, G.player.y - 30, `+$${reward}`, '#2ecc71');
  ms.idx += 1; ms.step = 0; ms.timer = 0; ms.holdT = 0; ms.started = false;
  if (ms.idx >= MISSIONS.length) {
    ms.storyDone = true;
    G.ui.banner('THE BIG SCORE — story complete!');
    G.saveBest();
  }
}

// Advance one step; returns true if the mission just completed.
export function updateMissions(G, dt) {
  const ms = G.missions;
  const m = currentMission(ms);
  if (!m || !ms.started) return;
  const s = m.steps[ms.step];
  const p = G.playerPos();
  const t = s.target ? s.target() : null;

  if (s.timer && ms.timer > 0) {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      // Out of time: restart the mission, keep the story moving.
      G.ui.banner('Too slow — the run is blown. Try again.');
      G.ui.dialogue('DELIA: "Clock beat you. Shake it off, run it again."', 'DELIA ROOK');
      ms.step = 0; ms.timer = s.timer; ms.holdT = 0;
      return;
    }
  }

  const dist = t ? Math.hypot(p.x - t.x, p.y - t.y) : 1e9;

  if (s.kind === 'steal') {
    if (G.player.inCar) advance(G);
    return;
  }
  if (s.kind === 'repo') {
    if (G.player.inCar && G.player.car && G.player.car.isRepo) advance(G);
    return;
  }
  if (s.kind === 'deliver') {
    if (G.player.inCar && dist < s.radius) { advance(G); }
    return;
  }
  if (s.kind === 'pickup') {
    if (dist < s.radius) {
      ms.packages += 1;
      G.audio.pickup();
      G.ui.banner(`Package ${ms.packages} on board — keep it moving`);
      G.addPickupText(p.x, p.y - 30, 'PACKAGE +1', '#ffe600');
      advance(G);
    }
    return;
  }
  if (s.kind === 'hold' || s.kind === 'vault') {
    if (dist < s.radius) {
      ms.holdT += dt;
      if (ms.holdT > 0.4 && ms.holdT < 0.5) {
        G.ui.banner(s.kind === 'vault' ? `Cracking vault lock ${s.vaultStage}/2 — hold position…` : 'Grabbing the cash…');
      }
      if (ms.holdT >= s.hold) {
        if (s.kind === 'vault') {
          ms.vaultStage = s.vaultStage;
          G.player.cash += s.vaultStage === 2 ? 250 : 60;
          if (s.alarm) { // second lock trips the alarm: the pressured escape begins
            G.addHeat(3 * CFG.HEAT_PER_STAR);
            G.ui.banner('ALARM! Vault open — now RUN');
            G.ui.dialogue('DELIA: "That\'s the alarm, Mara. Three stars. Hideout. GO."', 'DELIA ROOK');
          } else G.ui.banner('Lock 1 open — one more, stay on it');
        } else {
          G.player.cash += 250; // pocket cash from the vault floor
          G.addHeat(3 * CFG.HEAT_PER_STAR); // the alarm trips: 3 stars
        }
        advance(G);
      }
    } else ms.holdT = 0;
    return;
  }
  if (s.kind === 'escape') {
    if (dist < s.radius) {
      G.setHeat(0); // safehouse / hideout: the trail goes cold
      advance(G);
    }
    return;
  }
  // plain 'reach' — a courier DROP hands a parcel over (count goes down)
  if (dist < s.radius) {
    if (m.id === 'm2' && ms.packages > 0) {
      ms.packages -= 1;
      G.addPickupText(p.x, p.y - 30, 'DELIVERED', '#2ecc71');
    }
    advance(G);
  }
}

// ---------- free-roam progression: vehicle export + safehouse service ----
// A marked "wanted" car is always waiting somewhere in the city. Drive it
// under the port crane and the exporter pays cash — repeatable forever,
// and the cash loop funds safehouse health/ammo refills between jobs.
export function markExportCar(G, rng) {
  const pool = [...G.parked, ...G.traffic].filter((c) => !c.isRepo && !c.isExport);
  if (!pool.length) return null;
  const car = pool[Math.floor(rng.next() * pool.length)];
  car.isExport = true;
  G.exportCar = car;
  return car;
}

export function updateExportActivity(G, dt, rng) {
  if (!G.exportCar || G.exportCar.hp <= 0) { G.exportCar = null; }
  if (!G.exportCar) { markExportCar(G, rng); return; }
  const p = G.player;
  if (p.inCar && p.car === G.exportCar) {
    const c = CFG.PORT_CRANE;
    if (Math.hypot(p.car.x - c.x, p.car.y - c.y) < c.radius) {
      p.cash += CFG.EXPORT_REWARD;
      G.exportsDone = (G.exportsDone || 0) + 1;
      G.addPickupText(p.car.x, p.car.y - 34, `EXPORT +$${CFG.EXPORT_REWARD}`, '#2ecc71');
      G.ui.banner(`Vehicle exported — +$${CFG.EXPORT_REWARD} (total exports: ${G.exportsDone})`);
      G.audio.mission();
      // The exported car leaves on the crane ship; a fresh target is marked.
      G.traffic = G.traffic.filter((x) => x !== p.car);
      G.parked = G.parked.filter((x) => x !== p.car);
      const delivered = p.car;
      p.car = null; p.inCar = false;
      p.x = delivered.x + 36; p.y = delivered.y + 20;
      G.exportCar = null;
      markExportCar(G, rng);
    }
  }
}

// Press B at the safehouse: cash buys a full health + ammo refill.
export function trySafehouseService(G) {
  const p = G.player;
  const s = CFG.SAFEHOUSE;
  if (Math.hypot(p.x - s.x, p.y - s.y) > CFG.SAFEHOUSE_SERVICE_RADIUS && !p.inCar) return false;
  if (p.inCar) return false;
  if (p.cash < CFG.SAFEHOUSE_SERVICE_COST) { G.ui.banner(`Safehouse rest costs $${CFG.SAFEHOUSE_SERVICE_COST} — cash short`); return false; }
  if (p.hp >= CFG.PLAYER_HP && p.ammo >= CFG.START_AMMO) { G.ui.banner('Already fresh — save your cash'); return false; }
  p.cash -= CFG.SAFEHOUSE_SERVICE_COST;
  p.hp = CFG.PLAYER_HP; p.ammo = Math.max(p.ammo, CFG.START_AMMO) + 12;
  G.ui.banner(`Rested at the safehouse — health + ammo refilled (-$${CFG.SAFEHOUSE_SERVICE_COST})`);
  G.audio.pickup();
  return true;
}

function advance(G) {
  const ms = G.missions;
  const m = currentMission(ms);
  ms.step += 1; ms.holdT = 0;
  if (ms.step >= m.steps.length) { completeMission(G); return; }
  const s = m.steps[ms.step];
  if (s.timer) ms.timer = s.timer;
  if (s.wanted) G.addHeat(s.wanted * CFG.HEAT_PER_STAR);
  G.audio.pickup();
  G.ui.banner(m.steps[ms.step].text);
}
