// Entities: cars (player / parked / traffic / police), pedestrians,
// on-foot officers. Physics + simple AI, all in plain data objects.
import { CFG } from './config.js';

let _id = 1;
export function makeCar(x, y, angle, color, model = 'sedan', kind = 'traffic') {
  return {
    id: _id++, kind, model, color, x, y, angle,
    speed: 0, vx: 0, vy: 0, hp: 100,
    // traffic AI
    roadAxis: null, roadDir: 1, targetSpeed: 0, stuck: 0,
    // police AI
    ramCd: 0,
    w: model === 'truck' ? 52 : 44, h: model === 'truck' ? 22 : 20,
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
      rng.pick(CFG.COLORS.car), rng.pick(['sedan', 'sedan', 'coupe', 'truck']), 'parked');
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
      rng.pick(CFG.COLORS.car), rng.pick(['sedan', 'sedan', 'coupe', 'truck']), 'traffic');
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
      angle: rng.range(0, Math.PI * 2), speed: rng.range(28, 55),
      color: rng.pick(['#e8d44d', '#7fb3d5', '#d98880', '#a9dfbf', '#f0e6d2', '#c39bd3']),
      hp: 30, flee: 0, dead: false, walkPhase: rng.range(0, 6),
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
export function driveCar(car, mv, dt, world, onCrash) {
  const handbrake = mv.handbrake;
  const accel = mv.y < 0 ? CFG.CAR_ACCEL : (mv.y > 0 ? -CFG.CAR_REVERSE : 0);
  car.speed += accel * dt;
  if (!mv.y) car.speed *= Math.pow(0.4, dt); // coast / drag
  car.speed = Math.max(-CFG.CAR_MAX_REVERSE, Math.min(CFG.CAR_MAX_SPEED, car.speed));
  const steer = mv.x * CFG.CAR_TURN * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  car.angle += steer * (handbrake ? 1.6 : 1);
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

// --- traffic AI: follow the road grid, turn at intersections, slow for cars ahead ---
export function updateTraffic(list, world, dt, rng, allCars) {
  for (const c of list) {
    const aheadX = c.x + Math.cos(c.angle) * 46, aheadY = c.y + Math.sin(c.angle) * 46;
    let blocked = false;
    for (const o of allCars) {
      if (o === c) continue;
      const d = (o.x - aheadX) * (o.x - aheadX) + (o.y - aheadY) * (o.y - aheadY);
      if (d < 42 * 42) { blocked = true; break; }
    }
    const want = blocked ? 0 : c.targetSpeed;
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

// --- pedestrians: stroll the sidewalks, flee from gunfire ---
export function updatePeds(list, world, dt, rng, danger) {
  for (const p of list) {
    if (p.dead) continue;
    p.walkPhase += dt * 6;
    let dir = p.angle;
    if (danger && p.flee > 0) {
      p.flee -= dt;
      dir = Math.atan2(p.y - danger.y, p.x - danger.x);
    } else if (rng.chance(0.004)) {
      dir += rng.pick([-Math.PI / 2, Math.PI / 2, Math.PI]);
    }
    p.angle = dir;
    const sp = p.flee > 0 ? p.speed * 2.4 : p.speed;
    const px = p.x, py = p.y;
    p.x += Math.cos(dir) * sp * dt;
    p.y += Math.sin(dir) * sp * dt;
    if (world.pointInBuilding(p.x, p.y) || !world.onSidewalk(p.x, p.y)) {
      // wandered off the sidewalk: step back and turn around
      p.x = px; p.y = py; p.angle += Math.PI / 2;
    }
    if (p.x < 20 || p.y < 20 || p.x > world.w - 20 || p.y > world.h - 20) { p.x = px; p.y = py; p.angle += Math.PI; }
  }
}

// --- police cars: steer toward the player and ram; slide along walls
// instead of bouncing off them, so a chase can actually close in ---
export function updatePolice(list, playerPos, dt, world) {
  for (const c of list) {
    const dx = playerPos.x - c.x, dy = playerPos.y - c.y;
    const dist = Math.hypot(dx, dy) || 1;
    const want = Math.atan2(dy, dx);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
    const target = dist > 700 ? 520 : (dist > 120 ? 470 : 300);
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

export function updateOfficers(list, playerPos, dt, world) {
  for (const o of list) {
    const dx = playerPos.x - o.x, dy = playerPos.y - o.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = dist > 260 ? 175 : 150;
    o.x += (dx / dist) * sp * dt;
    o.y += (dy / dist) * sp * dt;
    world.resolveCircle(o, 12);
    o.angle = Math.atan2(dy, dx);
  }
}
