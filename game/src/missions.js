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
    briefing: 'DELIA: "Three drops, one clock. The buyers don\'t wait and neither does the heat. Move."',
    steps: [
      { text: 'Drop 1/3: the marina kiosk', target: () => ({ x: 1920, y: 960 }), radius: 70, kind: 'reach', timer: 90 },
      { text: 'Drop 2/3: the port gate', target: () => ({ x: 320, y: 1600 }), radius: 70, kind: 'reach' },
      { text: 'Drop 3/3: the north arcade', target: () => ({ x: 1280, y: 320 }), radius: 70, kind: 'reach' },
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
    briefing: 'DELIA: "The Bay Federal vault. In, out, gone. Grab the cash, then lose a three-star chase to the hideout. This is the one we retire on."',
    steps: [
      { text: 'Reach Bay Federal bank', target: () => CFG.BANK, radius: 80, kind: 'reach' },
      { text: 'Grab the cash (hold position)', target: () => CFG.BANK, radius: 80, kind: 'hold', hold: 4 },
      { text: 'Escape the 3-star chase — reach the hideout', target: () => CFG.HIDEOUT, radius: 80, kind: 'escape', wanted: 3 },
    ],
  },
];

export function missionState() {
  return { idx: 0, step: 0, timer: 0, holdT: 0, done: false, storyDone: false, started: false };
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
  const reward = CFG.MISSION_REWARDS[ms.idx] || 500;
  G.player.cash += reward;
  G.player.ammo = Math.max(G.player.ammo, CFG.START_AMMO);
  G.ui.banner(`Job done — +$${reward}`);
  G.ui.dialogue(`DELIA: "Clean work, Mara. $${reward} is yours. Next job when you're ready."`, 'DELIA ROOK');
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
  if (s.kind === 'hold') {
    if (dist < s.radius) {
      ms.holdT += dt;
      if (ms.holdT > 0.4 && ms.holdT < 0.5) G.ui.banner('Grabbing the cash…');
      if (ms.holdT >= s.hold) {
        G.player.cash += 250; // pocket cash from the vault floor
        G.addHeat(3 * CFG.HEAT_PER_STAR); // the alarm trips: 3 stars
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
  // plain 'reach'
  if (dist < s.radius) advance(G);
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
