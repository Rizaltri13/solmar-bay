// missions.js — Delia Rook's five jobs, plus the free-roam money loops.
//
// A mission is a list of steps. Each step knows its kind (steal, reach,
// pickup, repo, deliver, vault, escape), where it happens, and how close
// Mara must get. updateMissions() walks the list; completing the final step
// pays out and rolls straight into the next job's briefing cycle.
//
// The two free-roam systems live here too because they share the same
// reward plumbing: the port vehicle-export loop and the safehouse rest.

import { CFG } from './config.js';

export const STORY_INTRO =
  'Solmar Bay, 2026. Mara Voss drove getaway for the wrong crew once — ' +
  'never again. Now she drives for Delia Rook, the fixer who runs this ' +
  'sun-bleached port city from a payphone and a smile. Five jobs. ' +
  'One big score. Stay out of the cuffs.';

export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Wheels',
    briefing: 'DELIA: "You need wheels before you need a plan, Mara. Jack a car — any car — then bring it to my corner."',
    steps: [
      { text: 'Steal a car (walk up to one and press E)', target: null, radius: 0, kind: 'steal' },
      { text: "Drive to Delia's corner", target: () => CFG.DELIA, radius: 70, kind: 'reach' },
    ],
  },
  {
    id: 'm2',
    title: 'Courier Run',
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
    id: 'm3',
    title: 'Heat',
    briefing: 'DELIA: "A patrol made your plate. Two stars, Mara. Lose them and get to the safehouse — don\'t bring the law to my door."',
    steps: [
      { text: 'Escape the 2-star chase — reach the safehouse', target: () => CFG.SAFEHOUSE, radius: 80, kind: 'escape', wanted: 2 },
    ],
  },
  {
    id: 'm4',
    title: 'Repo Job',
    briefing: 'DELIA: "A coupe in the east lot skipped three payments. It\'s ours now. Bring it to the garage, scratch-free if you can."',
    steps: [
      { text: 'Steal the marked coupe in the east lot', target: () => ({ x: 2080, y: 1280 }), radius: 90, kind: 'repo' },
      { text: 'Deliver the coupe to the garage', target: () => CFG.GARAGE, radius: 80, kind: 'deliver' },
    ],
  },
  {
    id: 'm5',
    title: 'The Big Score',
    briefing: 'DELIA: "The Bay Federal vault. Two locks: crack the door, then hold the vault while it cycles. The second lock trips the alarm — then you lose a three-star chase to the hideout. This is the one we retire on."',
    steps: [
      { text: 'Reach Bay Federal bank', target: () => CFG.BANK, radius: 80, kind: 'reach' },
      { text: 'Vault lock 1/2 — hold at the vault door', target: () => CFG.BANK, radius: 80, kind: 'vault', hold: 2.5, vaultStage: 1 },
      { text: 'Vault lock 2/2 — hold while the vault cycles (alarm armed!)', target: () => CFG.BANK, radius: 80, kind: 'vault', hold: 3.5, vaultStage: 2, alarm: true },
      { text: 'Escape the 3-star chase — reach the hideout', target: () => CFG.HIDEOUT, radius: 80, kind: 'escape' },
    ],
  },
];

// Money is formatted in exactly one place so banners, dialogue and the
// pause panel can never disagree about how an amount is written.
export function formatCash(amount) {
  return '$' + Math.floor(amount).toLocaleString('en-US');
}

export function missionState() {
  return {
    idx: 0,
    step: 0,
    timer: 0,
    holdT: 0,
    done: false,
    storyDone: false,
    started: false,
    packages: 0,
    repoDamage: 0,
    vaultStage: 0,
    completedCount: 0,
  };
}

export function currentMission(ms) {
  return ms.idx < MISSIONS.length ? MISSIONS[ms.idx] : null;
}

export function currentStep(ms) {
  const mission = currentMission(ms);
  return mission ? mission.steps[ms.step] : null;
}

export function currentObjective(ms) {
  const mission = currentMission(ms);
  if (!mission) {
    return { text: 'Free roam — Solmar Bay is yours. Missions complete!', target: null };
  }
  const step = mission.steps[ms.step];
  return {
    text: `${mission.title}: ${step.text}`,
    target: step.target ? step.target() : null,
    step,
  };
}

// Starting a job applies whatever its first step demands up front — a
// countdown for the courier run, instant heat for Heat — then Delia talks.
export function startMission(G) {
  const ms = G.missions;
  const mission = currentMission(ms);
  if (!mission) return;
  ms.started = true;
  ms.step = 0;
  ms.timer = 0;
  ms.holdT = 0;
  const first = mission.steps[0];
  if (first.timer) ms.timer = first.timer;
  if (first.wanted) G.addHeat(first.wanted * CFG.HEAT_PER_STAR);
  G.ui.dialogue(mission.briefing, 'DELIA ROOK');
  G.ui.banner(`${mission.title} — ${mission.id.toUpperCase()}`);
  G.audio.mission();
}

function settleMission(G) {
  const ms = G.missions;
  const mission = currentMission(ms);
  let reward = CFG.MISSION_REWARDS[ms.idx] || 500;

  // Repo Job pays for care: the fee shrinks with every point of damage the
  // coupe collected on the way to the garage, down to a floor.
  if (mission && mission.id === 'm4') {
    const cut = Math.min(1000, Math.round(ms.repoDamage * 10));
    reward = Math.max(500, reward - cut);
    if (cut > 0) {
      G.ui.dialogue(`DELIA: "Scratches cost money, Mara. -$${cut} off the repo fee."`, 'DELIA ROOK');
    } else {
      G.ui.dialogue('DELIA: "Scratch-free. Full fee, plus my respect."', 'DELIA ROOK');
    }
  }

  G.player.cash += reward;
  if (G.stats) {
    G.stats.cashEarned += reward;
    G.stats.missionsCompleted += 1;
  }
  ms.completedCount += 1;
  G.player.ammo = Math.max(G.player.ammo, CFG.START_AMMO);
  G.ui.banner(`Job done — +${formatCash(reward)}`);
  if (!(mission && mission.id === 'm4')) {
    G.ui.dialogue(`DELIA: "Clean work, Mara. ${formatCash(reward)} is yours. Next job when you're ready."`, 'DELIA ROOK');
  }
  G.audio.mission();
  G.addPickupText(G.player.x, G.player.y - 30, `+$${reward}`, '#2ecc71');

  ms.idx += 1;
  ms.step = 0;
  ms.timer = 0;
  ms.holdT = 0;
  ms.started = false;
  if (ms.idx >= MISSIONS.length) {
    ms.storyDone = true;
    G.ui.banner('THE BIG SCORE — story complete!');
    G.saveBest();
  }
}

function advance(G) {
  const ms = G.missions;
  const mission = currentMission(ms);
  ms.step += 1;
  ms.holdT = 0;
  if (ms.step >= mission.steps.length) {
    settleMission(G);
    return;
  }
  const step = mission.steps[ms.step];
  if (step.timer) ms.timer = step.timer;
  if (step.wanted) G.addHeat(step.wanted * CFG.HEAT_PER_STAR);
  G.audio.pickup();
  G.ui.banner(step.text);
}

// The per-frame mission driver. Each step kind is a small, separate rule;
// anything unrecognised falls through to the plain reach rule at the end.
export function updateMissions(G, dt) {
  const ms = G.missions;
  const mission = currentMission(ms);
  if (!mission || !ms.started) return;
  const step = mission.steps[ms.step];
  const pos = G.playerPos();
  const target = step.target ? step.target() : null;

  // The courier clock is shared by the whole run: run it dry and the job
  // restarts from its first step instead of soft-locking the story.
  if (step.timer && ms.timer > 0) {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      G.ui.banner('Too slow — the run is blown. Try again.');
      G.ui.dialogue('DELIA: "Clock beat you. Shake it off, run it again."', 'DELIA ROOK');
      ms.step = 0;
      ms.timer = step.timer;
      ms.holdT = 0;
      return;
    }
  }

  const dist = target ? Math.hypot(pos.x - target.x, pos.y - target.y) : Infinity;

  switch (step.kind) {
    case 'steal':
      if (G.player.inCar) advance(G);
      return;
    case 'repo':
      if (G.player.inCar && G.player.car && G.player.car.isRepo) advance(G);
      return;
    case 'deliver':
      if (G.player.inCar && dist < step.radius) advance(G);
      return;
    case 'pickup':
      if (dist < step.radius) {
        ms.packages += 1;
        G.audio.pickup();
        G.ui.banner(`Package ${ms.packages} on board — keep it moving`);
        G.addPickupText(pos.x, pos.y - 30, 'PACKAGE +1', '#ffe600');
        advance(G);
      }
      return;
    case 'hold':
    case 'vault':
      updateHoldStep(G, step, dist, dt);
      return;
    case 'escape':
      if (dist < step.radius) {
        G.setHeat(0);
        advance(G);
      }
      return;
    default:
      break;
  }

  // Plain reach. On the Courier Run a reach step is a drop-off, so a
  // carried parcel is handed over as the step completes.
  if (dist < step.radius) {
    if (mission.id === 'm2' && ms.packages > 0) {
      ms.packages -= 1;
      G.addPickupText(pos.x, pos.y - 30, 'DELIVERED', '#2ecc71');
    }
    advance(G);
  }
}

function updateHoldStep(G, step, dist, dt) {
  const ms = G.missions;
  if (dist >= step.radius) {
    ms.holdT = 0;
    return;
  }
  ms.holdT += dt;
  if (ms.holdT > 0.4 && ms.holdT < 0.5) {
    G.ui.banner(step.kind === 'vault'
      ? `Cracking vault lock ${step.vaultStage}/2 — hold position…`
      : 'Grabbing the cash…');
  }
  if (ms.holdT < step.hold) return;

  if (step.kind === 'vault') {
    ms.vaultStage = step.vaultStage;
    G.player.cash += step.vaultStage === 2 ? 250 : 60;
    if (step.alarm) {
      G.addHeat(3 * CFG.HEAT_PER_STAR);
      G.ui.banner('ALARM! Vault open — now RUN');
      G.ui.dialogue('DELIA: "That\'s the alarm, Mara. Three stars. Hideout. GO."', 'DELIA ROOK');
    } else {
      G.ui.banner('Lock 1 open — one more, stay on it');
    }
  } else {
    G.player.cash += 250;
    G.addHeat(3 * CFG.HEAT_PER_STAR);
  }
  advance(G);
}

// ---- free-roam: vehicle export ---------------------------------------------------
//
// One ordinary car in the city is always marked as wanted by the port
// exporter. Delivering it under the main crane pays out and immediately
// marks the next one, so the loop never runs dry between story jobs.

export function markExportCar(G, rng) {
  const candidates = [...G.parked, ...G.traffic].filter((car) => !car.isRepo && !car.isExport);
  if (candidates.length === 0) return null;
  const chosen = candidates[Math.floor(rng.next() * candidates.length)];
  chosen.isExport = true;
  G.exportCar = chosen;
  return chosen;
}

export function updateExportActivity(G, dt, rng) {
  if (G.exportCar && G.exportCar.hp <= 0) G.exportCar = null;
  if (!G.exportCar) {
    markExportCar(G, rng);
    return;
  }
  const player = G.player;
  if (!player.inCar || player.car !== G.exportCar) return;
  const crane = CFG.PORT_CRANE;
  const underCrane = Math.hypot(player.car.x - crane.x, player.car.y - crane.y) < crane.radius;
  if (!underCrane) return;

  player.cash += CFG.EXPORT_REWARD;
  if (G.stats) {
    G.stats.cashEarned += CFG.EXPORT_REWARD;
    G.stats.exportsDone += 1;
  }
  G.exportsDone = (G.exportsDone || 0) + 1;
  G.addPickupText(player.car.x, player.car.y - 34, `EXPORT +$${CFG.EXPORT_REWARD}`, '#2ecc71');
  G.ui.banner(`Vehicle exported — +$${CFG.EXPORT_REWARD} (total exports: ${G.exportsDone})`);
  G.audio.mission();

  // The car leaves on the crane ship. Mara steps out beside the dock and
  // a fresh export target is marked somewhere in the city.
  const delivered = player.car;
  G.traffic = G.traffic.filter((car) => car !== delivered);
  G.parked = G.parked.filter((car) => car !== delivered);
  player.car = null;
  player.inCar = false;
  player.x = delivered.x + 36;
  player.y = delivered.y + 20;
  G.exportCar = null;
  markExportCar(G, rng);
}

// ---- free-roam: safehouse rest -----------------------------------------------------
//
// Press B beside the safehouse, on foot, to trade cash for a full health
// refill and a topped-up magazine. Each refusal says why, briefly.

export function trySafehouseService(G) {
  const player = G.player;
  const home = CFG.SAFEHOUSE;
  if (player.inCar) return false;
  if (Math.hypot(player.x - home.x, player.y - home.y) > CFG.SAFEHOUSE_SERVICE_RADIUS) return false;
  if (player.cash < CFG.SAFEHOUSE_SERVICE_COST) {
    G.ui.banner(`Safehouse rest costs ${formatCash(CFG.SAFEHOUSE_SERVICE_COST)} — cash short`);
    return false;
  }
  if (player.hp >= CFG.PLAYER_HP && player.ammo >= CFG.START_AMMO) {
    G.ui.banner('Already fresh — save your cash');
    return false;
  }
  player.cash -= CFG.SAFEHOUSE_SERVICE_COST;
  player.hp = CFG.PLAYER_HP;
  player.ammo = Math.max(player.ammo, CFG.START_AMMO) + 12;
  G.ui.banner(`Rested at the safehouse — health + ammo refilled (-${formatCash(CFG.SAFEHOUSE_SERVICE_COST)})`);
  G.audio.pickup();
  return true;
}
