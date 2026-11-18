// Entities: cars (player / parked / traffic / police), pedestrians,
// on-foot officers. Physics + simple AI, all in plain data objects.
import { CFG } from './config.js';

let _id = 1;
export function vehicleClass(model) {
  return CFG.VEHICLE_CLASSES[model] || CFG.VEHICLE_CLASSES.sedan;
}

export function makeCar(x, y, angle, color, model = 'sedan', kind = 'traffic') {
  return {
    id: _id++, kind, model, color, x, y, angle,
    speed: 0, vx: 0, vy: 0, hp: 100, damage: 0, hitFlash: 0,
    // traffic AI — panicT makes a car swerve + hurry after an impact;
    // blockedT / honkCd drive the v3 "impatient driver" honk when a car
    // sits blocked behind another vehicle or a pedestrian for a while.
    roadAxis: null, roadDir: 1, targetSpeed: 0, stuck: 0, panicT: 0, honkT: 0,
    blockedT: 0, honkCd: 0, wantsHonk: false,
    // police AI — pursuit / search / roadblock state machine
    ramCd: 0, policeState: 'chase', searchT: 0, searchTarget: null, lastSeen: null,
    w: model === 'truck' || model === 'van' ? 52 : 44, h: model === 'truck' || model === 'van' ? 23 : 20,
  };
}

export function spawnParked(world, rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = world.randomRoadPoint(rng);
    const vertical = rng.chance(0.5);
    const ox = vertical ? rng.pick([-1, 1]) * (CFG.ROAD_W / 2 - 12) : 0;
    const oy = vertical ? 0 : rng.pick([-1, 1]) * (CFG.ROAD_W / 2 - 12);
    const c = makeCar(p.x + ox, p.y + oy, vertical ? Math.PI / 2 : 0,
      rng.pick(CFG.COLORS.car), rng.pick(['sedan', 'sedan', 'coupe', 'truck', 'van']), 'parked');
    if (!world.pointInBuilding(c.x, c.y)) out.push(c);
  }
  return out;
}

export function spawnTraffic(world, rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = world.randomRoadPoint(rng);
    const vertical = Math.abs(p.x - world.roadsX.reduce((a, b) => Math.abs(p.x - b) < Math.abs(p.x - a) ? b : a)) < 20;
    const c = makeCar(p.x, p.y, vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI),
      rng.pick(CFG.COLORS.car),
      rng.weighted([['sedan', 5], ['coupe', 2], ['truck', 1.4], ['van', 1.6]]), 'traffic');
    c.roadAxis = vertical ? 'y' : 'x';
    c.roadDir = rng.chance(0.5) ? 1 : -1;
    c.targetSpeed = rng.range(90, 170);
    out.push(c);
  }
  return out;
}

export function spawnPeds(world, rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = world.randomRoadPoint(rng);
    out.push({
      id: _id++, x: p.x + rng.range(-40, 40), y: p.y + rng.range(-40, 40),
      angle: rng.angle(), speed: rng.range(28, 55),
      color: rng.pick(['#e8d44d', '#7fb3d5', '#d98880', '#a9dfbf', '#f0e6d2', '#c39bd3']),
      hp: 30, flee: 0, dead: false, walkPhase: rng.range(0, 6), hitFlash: 0, dodgeT: 0,
    });
  }
  return out;
}

export function spawnPoliceCar(world, x, y) {
  const c = makeCar(x, y, 0, CFG.COLORS.police, 'sedan', 'police');
  c.targetSpeed = 480;
  return c;
}

// --- player car physics: arcade accel + steering + handbrake drift ---
// Handling comes from the vehicle class: coupes are quick and loose,
// trucks and vans are heavy, slow and grippy, sedans sit in the middle.
export function driveCar(car, mv, dt, world, onCrash) {
  const vc = vehicleClass(car.model);
  const handbrake = mv.handbrake;
  const accel = mv.y < 0 ? CFG.CAR_ACCEL * vc.accelMul : (mv.y > 0 ? -CFG.CAR_REVERSE : 0);
  car.speed += accel * dt;
  if (!mv.y) car.speed *= Math.pow(0.4, dt); // coast / drag
  const maxF = CFG.CAR_MAX_SPEED * vc.maxMul;
  car.speed = Math.max(-CFG.CAR_MAX_REVERSE, Math.min(maxF, car.speed));
  const steer = mv.x * CFG.CAR_TURN * vc.turnMul * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  // Grip is real now: grippy classes (truck/van) resist the handbrake
  // swing, loose classes (coupe) rotate eagerly.
  car.angle += steer * (handbrake ? 1.6 / vc.gripMul : 1);
  const px = car.x, py = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const crashed = world.pointInBuilding(car.x, car.y) ||
    car.x < 24 || car.y < 24 || car.x > world.w - 24 || car.y > world.h - 24;
  if (crashed) {
    car.x = px; car.y = py;
    if (Math.abs(car.speed) > 180 && onCrash) onCrash(Math.abs(car.speed));
    car.speed *= -0.25;
  }
  return { drifting: handbrake && Math.abs(car.speed) > 200, crashed };
}

// A traffic car that gets hit (or nearly hit) panics: swerve + hurry away.
export function panicTrafficCar(car, fromX, fromY) {
  car.panicT = 2.2; car.honkT = 0.6; car.hitFlash = 0.35;
  car.damage = Math.min(100, (car.damage || 0) + 12);
  const away = Math.atan2(car.y - fromY, car.x - fromX);
  car.angle += (away - car.angle) * 0.25;
}

// --- traffic AI: follow the road grid, turn at intersections, slow for
// cars ahead AND for pedestrians stepping onto a crossing ---
export function updateTraffic(list, world, dt, rng, allCars, peds = []) {
  for (const c of list) {
    c.hitFlash = Math.max(0, (c.hitFlash || 0) - dt);
    c.panicT = Math.max(0, (c.panicT || 0) - dt);
    c.honkCd = Math.max(0, (c.honkCd || 0) - dt);
    c.wantsHonk = false;
    const aheadX = c.x + Math.cos(c.angle) * 46, aheadY = c.y + Math.sin(c.angle) * 46;
    let blocked = false;
    for (const o of allCars) {
      if (o === c) continue;
      const d = (o.x - aheadX) * (o.x - aheadX) + (o.y - aheadY) * (o.y - aheadY);
      if (d < 42 * 42) { blocked = true; break; }
    }
    for (const pd of peds) { // brake for a pedestrian on the road ahead
      if (pd.dead) continue;
      const d = (pd.x - aheadX) * (pd.x - aheadX) + (pd.y - aheadY) * (pd.y - aheadY);
      if (d < 34 * 34) { blocked = true; break; }
    }
    // Impatience (v3): time spent blocked accumulates; past the config
    // threshold the driver asks main.js for a honk (audio lives there),
    // then cools down so a jam is a chorus, not a single endless blast.
    if (blocked && Math.abs(c.speed) < 24) {
      c.blockedT = (c.blockedT || 0) + dt;
      if (c.blockedT >= CFG.TRAFFIC_HONK_AFTER && c.honkCd <= 0) {
        c.wantsHonk = true; c.honkCd = CFG.TRAFFIC_HONK_COOLDOWN; c.blockedT = 0;
      }
    } else c.blockedT = Math.max(0, (c.blockedT || 0) - dt * 2);
    const want = blocked ? 0 : (c.panicT > 0 ? c.targetSpeed * 1.7 : c.targetSpeed);
    c.speed += Math.max(-260, Math.min(260, (want - c.speed))) * dt;
    const px = c.x, py = c.y;
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    if (world.pointInBuilding(c.x, c.y) || c.x < 30 || c.y < 30 || c.x > world.w - 30 || c.y > world.h - 30) {
      c.x = px; c.y = py; c.angle += Math.PI / 2; c.speed = 0;
    }
    // At an intersection, sometimes turn onto the crossing road.
    const nearX = world.roadsX.some((rx) => Math.abs(c.x - rx) < 8);
    const nearY = world.roadsY.some((ry) => Math.abs(c.y - ry) < 8);
    if (nearX && nearY && rng.chance(0.012)) {
      c.angle += rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      c.roadAxis = Math.abs(Math.cos(c.angle)) > 0.5 ? 'x' : 'y';
    }
    // Keep the car glued to its lane: nudge toward the nearest road centre line.
    if (c.roadAxis === 'x') {
      const ry = world.roadsY.reduce((a, b) => Math.abs(c.y - b) < Math.abs(c.y - a) ? b : a);
      c.y += (ry + (c.roadDir > 0 ? 14 : -14) - c.y) * Math.min(1, dt * 2);
      c.angle = c.roadDir > 0 ? 0 : Math.PI;
    } else if (c.roadAxis === 'y') {
      const rx = world.roadsX.reduce((a, b) => Math.abs(c.x - b) < Math.abs(c.x - a) ? b : a);
      c.x += (rx + (c.roadDir > 0 ? 14 : -14) - c.x) * Math.min(1, dt * 2);
      c.angle = c.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
}

// --- pedestrians: stroll the sidewalks, use crossings, dodge traffic,
// and flee from the ACTUAL danger source (gunshot / crash position) ---
export function updatePeds(list, world, dt, rng, danger, cars = []) {
  for (const p of list) {
    if (p.dead) continue;
    p.walkPhase += dt * 6;
    p.hitFlash = Math.max(0, (p.hitFlash || 0) - dt);
    let dir = p.angle;
    // A car bearing down on this pedestrian: step aside, fast.
    let dodge = null;
    for (const c of cars) {
      if (Math.abs(c.speed || 0) < 60) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < 58) { dodge = Math.atan2(p.y - c.y, p.x - c.x); break; }
    }
    if (dodge !== null) { dir = dodge; p.dodgeT = 0.5; }
    else if (danger && p.flee > 0) {
      p.flee -= dt;
      dir = Math.atan2(p.y - danger.y, p.x - danger.x); // away from the shot / crash itself
    } else if (rng.chance(0.004)) {
      dir += rng.pick([-Math.PI / 2, Math.PI / 2, Math.PI]);
    }
    p.angle = dir;
    const sp = p.dodgeT > 0 ? p.speed * 2.8 : (p.flee > 0 ? p.speed * 2.4 : p.speed);
    p.dodgeT = Math.max(0, (p.dodgeT || 0) - dt);
    const px = p.x, py = p.y;
    p.x += Math.cos(dir) * sp * dt;
    p.y += Math.sin(dir) * sp * dt;
    // Pedestrians may leave the sidewalk ON a zebra crossing (near an
    // intersection) — that is how street crossings happen in Solmar Bay.
    const nearCrossing = world.roadsX.some((rx) => Math.abs(p.x - rx) < 52) &&
      world.roadsY.some((ry) => Math.abs(p.y - ry) < 52);
    if (world.pointInBuilding(p.x, p.y) || (!world.onSidewalk(p.x, p.y) && !nearCrossing)) {
      // wandered off the sidewalk (and not on a crossing): step back, turn
      p.x = px; p.y = py; p.angle += Math.PI / 2;
    }
    if (p.x < 20 || p.y < 20 || p.x > world.w - 20 || p.y > world.h - 20) { p.x = px; p.y = py; p.angle += Math.PI; }
  }
}

export function makeRoadblockCar(world, x, y, angle) {
  const c = makeCar(x, y, angle, CFG.COLORS.police, 'sedan', 'roadblock');
  c.policeState = 'roadblock'; c.speed = 0;
  return c;
}

// --- police cars: PURSUIT while they can see Mara; when sight breaks they
// drive to the last-seen point and SEARCH the surrounding blocks. They
// slide along walls instead of bouncing, so a chase can actually close in.
// vision = { seen, lastSeen } computed once per frame by main (LOS test). ---
export function updatePolice(list, playerPos, dt, world, vision = null) {
  for (const c of list) {
    if (c.kind === 'roadblock' || c.policeState === 'roadblock') { c.speed = 0; continue; }
    const seen = vision ? vision.seen : true;
    if (seen) { c.policeState = 'chase'; c.lastSeen = { x: playerPos.x, y: playerPos.y }; c.searchT = 0; }
    else if (c.lastSeen) c.policeState = 'search';
    let goal = playerPos;
    if (c.policeState === 'search') {
      c.searchT += dt;
      if (!c.searchTarget || Math.hypot(c.searchTarget.x - c.x, c.searchTarget.y - c.y) < 60) {
        // sweep the blocks around the last-seen point, one road point at a time
        const a = c.searchT * 0.9 + c.id;
        c.searchTarget = world.nearestRoadPoint(
          c.lastSeen.x + Math.cos(a) * 190, c.lastSeen.y + Math.sin(a) * 190);
      }
      goal = c.searchTarget;
    }
    const dx = goal.x - c.x, dy = goal.y - c.y;
    const dist = Math.hypot(dx, dy) || 1;
    const want = Math.atan2(dy, dx);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
    const target = c.policeState === 'search' ? 300 : (dist > 700 ? 520 : (dist > 120 ? 470 : 300));
    c.speed += (target - c.speed) * Math.min(1, dt * 1.4);
    const step = c.speed * dt;
    const nx = c.x + Math.cos(c.angle) * step;
    const ny = c.y + Math.sin(c.angle) * step;
    if (!world.pointInBuilding(nx, ny)) { c.x = nx; c.y = ny; }
    else if (!world.pointInBuilding(nx, c.y)) { c.x = nx; } // slide along x
    else if (!world.pointInBuilding(c.x, ny)) { c.y = ny; } // slide along y
    else { c.angle += Math.PI / 3; c.speed *= 0.5; }
    if (c.x < 24 || c.y < 24 || c.x > world.w - 24 || c.y > world.h - 24) {
      c.x = Math.max(24, Math.min(world.w - 24, c.x));
      c.y = Math.max(24, Math.min(world.h - 24, c.y));
      c.angle += Math.PI / 2;
    }
  }
}

export function makeOfficer(id, x, y) {
  return { id, x, y, angle: 0, hp: 60, shootCd: 1 + (id % 5) * 0.27, hitFlash: 0, state: 'chase' };
}

// Officers keep their distance and RETURN FIRE at range when they have
// line of sight; they only rush in to grab Mara at close quarters, and in
// the search phase they fan out around the last-seen point.
export function updateOfficers(list, playerPos, dt, world, vision = null) {
  for (const o of list) {
    o.hitFlash = Math.max(0, (o.hitFlash || 0) - dt);
    o.shootCd = Math.max(0, (o.shootCd || 0) - dt);
    const seen = vision ? vision.seen : true;
    let goal = playerPos;
    if (!seen && vision && vision.lastSeen) {
      o.state = 'search';
      goal = { x: vision.lastSeen.x + Math.cos(o.id) * 90, y: vision.lastSeen.y + Math.sin(o.id) * 90 };
    } else o.state = 'chase';
    const dx = goal.x - o.x, dy = goal.y - o.y;
    const dist = Math.hypot(dx, dy) || 1;
    const realDist = Math.hypot(playerPos.x - o.x, playerPos.y - o.y) || 1;
    // Hold a firing line at 130–300px instead of sprinting into grab range.
    const wantsMove = o.state === 'search' || realDist > 300 || realDist < 110;
    const sp = realDist > 260 ? 175 : 150;
    if (wantsMove && dist > 24) { o.x += (dx / dist) * sp * dt; o.y += (dy / dist) * sp * dt; }
    world.resolveCircle(o, 12);
    o.angle = Math.atan2(playerPos.y - o.y, playerPos.x - o.x);
    // Return fire: main.js turns this flag into damage + a tracer.
    o.wantsFire = !!(seen && realDist >= 110 && realDist <= 320 && o.shootCd <= 0);
    if (o.wantsFire) o.shootCd = 1.35;
  }
}
