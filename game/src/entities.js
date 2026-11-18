// entities.js — every moving thing in Solmar Bay except Mara herself.
//
// Cars (parked, traffic, police, roadblocks), pedestrians and on-foot
// officers are plain data objects; the functions here create them and step
// their behaviour. Rendering lives in render.js, orchestration in main.js —
// this module never touches the canvas or the DOM.

import { CFG } from './config.js';

let nextId = 1;

export function vehicleClass(model) {
  return CFG.VEHICLE_CLASSES[model] || CFG.VEHICLE_CLASSES.sedan;
}

function isHeavy(model) {
  return model === 'truck' || model === 'van';
}

export function makeCar(x, y, angle, color, model = 'sedan', kind = 'traffic') {
  return {
    id: nextId++,
    kind,
    model,
    color,
    x,
    y,
    angle,
    speed: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    damage: 0,
    hitFlash: 0,
    // Traffic state. panicT: swerving away after an impact. blockedT /
    // honkCd / wantsHonk implement the impatient-driver honk: entities set
    // the flag, main.js owns the actual sound.
    roadAxis: null,
    roadDir: 1,
    targetSpeed: 0,
    stuck: 0,
    panicT: 0,
    honkT: 0,
    blockedT: 0,
    honkCd: 0,
    wantsHonk: false,
    // Police state: chase while the player is visible, search after the
    // trail goes cold, roadblock when parked across an intersection.
    ramCd: 0,
    policeState: 'chase',
    searchT: 0,
    searchTarget: null,
    lastSeen: null,
    w: isHeavy(model) ? 52 : 44,
    h: isHeavy(model) ? 23 : 20,
  };
}

// ---- spawning ---------------------------------------------------------------

export function spawnParked(world, rng, count) {
  const spawned = [];
  for (let i = 0; i < count; i++) {
    const anchor = world.randomRoadPoint(rng);
    const vertical = rng.chance(0.5);
    const laneOffset = CFG.ROAD_W / 2 - 12;
    const car = makeCar(
      anchor.x + (vertical ? rng.pick([-1, 1]) * laneOffset : 0),
      anchor.y + (vertical ? 0 : rng.pick([-1, 1]) * laneOffset),
      vertical ? Math.PI / 2 : 0,
      rng.pick(CFG.COLORS.car),
      rng.pick(['sedan', 'sedan', 'coupe', 'truck', 'van']),
      'parked',
    );
    if (!world.pointInBuilding(car.x, car.y)) spawned.push(car);
  }
  return spawned;
}

function nearestLine(value, lines) {
  let best = lines[0];
  for (const line of lines) {
    if (Math.abs(value - line) < Math.abs(value - best)) best = line;
  }
  return best;
}

export function spawnTraffic(world, rng, count) {
  const spawned = [];
  for (let i = 0; i < count; i++) {
    const anchor = world.randomRoadPoint(rng);
    const vertical = Math.abs(anchor.x - nearestLine(anchor.x, world.roadsX)) < 20;
    const heading = vertical
      ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      : (rng.chance(0.5) ? 0 : Math.PI);
    const car = makeCar(
      anchor.x, anchor.y, heading,
      rng.pick(CFG.COLORS.car),
      rng.weighted([['sedan', 5], ['coupe', 2], ['truck', 1.4], ['van', 1.6]]),
      'traffic',
    );
    car.roadAxis = vertical ? 'y' : 'x';
    car.roadDir = rng.chance(0.5) ? 1 : -1;
    car.targetSpeed = rng.range(90, 170);
    spawned.push(car);
  }
  return spawned;
}

const PED_PAINTS = ['#e8d44d', '#7fb3d5', '#d98880', '#a9dfbf', '#f0e6d2', '#c39bd3'];

export function spawnPeds(world, rng, count) {
  const spawned = [];
  for (let i = 0; i < count; i++) {
    const anchor = world.randomRoadPoint(rng);
    spawned.push({
      id: nextId++,
      x: anchor.x + rng.range(-40, 40),
      y: anchor.y + rng.range(-40, 40),
      angle: rng.angle(),
      speed: rng.range(28, 55),
      color: rng.pick(PED_PAINTS),
      hp: 30,
      flee: 0,
      dead: false,
      walkPhase: rng.range(0, 6),
      hitFlash: 0,
      dodgeT: 0,
    });
  }
  return spawned;
}

export function spawnPoliceCar(world, x, y) {
  const car = makeCar(x, y, 0, CFG.COLORS.police, 'sedan', 'police');
  car.targetSpeed = 480;
  return car;
}

export function makeRoadblockCar(world, x, y, angle) {
  const car = makeCar(x, y, angle, CFG.COLORS.police, 'sedan', 'roadblock');
  car.policeState = 'roadblock';
  car.speed = 0;
  return car;
}

export function makeOfficer(id, x, y) {
  return {
    id, x, y,
    angle: 0,
    hp: 60,
    shootCd: 1 + (id % 5) * 0.27,
    hitFlash: 0,
    state: 'chase',
  };
}

// ---- player driving -----------------------------------------------------------
//
// Arcade model: a scalar speed along the heading, steering authority that
// grows with speed, and a handbrake that trades grip for rotation. The
// vehicle class scales everything, so a coupe feels nervous and a truck
// feels like furniture.
export function driveCar(car, mv, dt, world, onCrash) {
  const spec = vehicleClass(car.model);
  let throttle = 0;
  if (mv.y < 0) throttle = CFG.CAR_ACCEL * spec.accelMul;
  else if (mv.y > 0) throttle = -CFG.CAR_REVERSE;
  car.speed += throttle * dt;
  if (!mv.y) car.speed *= Math.pow(0.4, dt);

  const topSpeed = CFG.CAR_MAX_SPEED * spec.maxMul;
  car.speed = Math.max(-CFG.CAR_MAX_REVERSE, Math.min(topSpeed, car.speed));

  const speedAuthority = Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  const direction = car.speed >= 0 ? 1 : -1;
  let steer = mv.x * CFG.CAR_TURN * spec.turnMul * dt * direction * speedAuthority;
  if (mv.handbrake) steer *= 1.6 / spec.gripMul;
  car.angle += steer;

  const prevX = car.x;
  const prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  const hitWall = world.pointInBuilding(car.x, car.y) !== null
    || car.x < 24 || car.y < 24 || car.x > world.w - 24 || car.y > world.h - 24;
  if (hitWall) {
    car.x = prevX;
    car.y = prevY;
    if (Math.abs(car.speed) > 180 && onCrash) onCrash(Math.abs(car.speed));
    car.speed *= -0.25;
  }
  return { drifting: Boolean(mv.handbrake) && Math.abs(car.speed) > 200, crashed: hitWall };
}

export function panicTrafficCar(car, fromX, fromY) {
  car.panicT = 2.2;
  car.honkT = 0.6;
  car.hitFlash = 0.35;
  car.damage = Math.min(100, (car.damage || 0) + 12);
  const escapeHeading = Math.atan2(car.y - fromY, car.x - fromX);
  car.angle += (escapeHeading - car.angle) * 0.25;
}

// ---- traffic ------------------------------------------------------------------
//
// Traffic follows the road grid: hold a lane offset from the centre line,
// turn occasionally at intersections, and stop for anything in the probe
// point ahead — another car or a pedestrian on a crossing.

function probeBlocked(car, allCars, peds) {
  const probeX = car.x + Math.cos(car.angle) * 46;
  const probeY = car.y + Math.sin(car.angle) * 46;
  for (const other of allCars) {
    if (other === car) continue;
    const dx = other.x - probeX;
    const dy = other.y - probeY;
    if (dx * dx + dy * dy < 42 * 42) return true;
  }
  for (const ped of peds) {
    if (ped.dead) continue;
    const dx = ped.x - probeX;
    const dy = ped.y - probeY;
    if (dx * dx + dy * dy < 34 * 34) return true;
  }
  return false;
}

export function updateTraffic(list, world, dt, rng, allCars, peds = []) {
  for (const car of list) {
    car.hitFlash = Math.max(0, (car.hitFlash || 0) - dt);
    car.panicT = Math.max(0, (car.panicT || 0) - dt);
    car.honkCd = Math.max(0, (car.honkCd || 0) - dt);
    car.wantsHonk = false;

    const blocked = probeBlocked(car, allCars, peds);

    // `stuck` tracks total stationary-behind-something time for this car;
    // it resets the moment traffic flows again.
    if (blocked && Math.abs(car.speed) < 24) car.stuck = (car.stuck || 0) + dt;
    else car.stuck = 0;
    // Patience drains while stationary behind an obstruction; at zero the
    // driver asks main.js for a honk and starts a fresh cooldown.
    if (blocked && Math.abs(car.speed) < 24) {
      car.blockedT = (car.blockedT || 0) + dt;
      if (car.blockedT >= CFG.TRAFFIC_HONK_AFTER && car.honkCd <= 0) {
        car.wantsHonk = true;
        car.honkCd = CFG.TRAFFIC_HONK_COOLDOWN;
        car.blockedT = 0;
      }
    } else {
      car.blockedT = Math.max(0, (car.blockedT || 0) - dt * 2);
    }

    let desired = car.targetSpeed;
    if (blocked) desired = 0;
    else if (car.panicT > 0) desired = car.targetSpeed * 1.7;
    const delta = Math.max(-260, Math.min(260, desired - car.speed));
    car.speed += delta * dt;

    const prevX = car.x;
    const prevY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (world.pointInBuilding(car.x, car.y)
      || car.x < 30 || car.y < 30 || car.x > world.w - 30 || car.y > world.h - 30) {
      car.x = prevX;
      car.y = prevY;
      car.angle += Math.PI / 2;
      car.speed = 0;
    }

    const atCrossX = world.roadsX.some((rx) => Math.abs(car.x - rx) < 8);
    const atCrossY = world.roadsY.some((ry) => Math.abs(car.y - ry) < 8);
    if (atCrossX && atCrossY && rng.chance(0.012)) {
      car.angle += rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      car.roadAxis = Math.abs(Math.cos(car.angle)) > 0.5 ? 'x' : 'y';
    }

    // Lane keeping: ease back toward the lane line for the travel axis.
    if (car.roadAxis === 'x') {
      const line = nearestLine(car.y, world.roadsY);
      car.y += (line + (car.roadDir > 0 ? 14 : -14) - car.y) * Math.min(1, dt * 2);
      car.angle = car.roadDir > 0 ? 0 : Math.PI;
    } else if (car.roadAxis === 'y') {
      const line = nearestLine(car.x, world.roadsX);
      car.x += (line + (car.roadDir > 0 ? 14 : -14) - car.x) * Math.min(1, dt * 2);
      car.angle = car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
}

// ---- pedestrians ----------------------------------------------------------------
//
// Sidewalk strollers with three overrides, in priority order: dodge a car
// that is about to hit them, flee from a live danger point (a gunshot or a
// crash — a position, not a person), or wander with occasional turns.
// Crossings near intersections are the one legal way off the sidewalk.

export function updatePeds(list, world, dt, rng, danger, cars = []) {
  for (const ped of list) {
    if (ped.dead) continue;
    ped.walkPhase += dt * 6;
    ped.hitFlash = Math.max(0, (ped.hitFlash || 0) - dt);
    ped.dodgeT = Math.max(0, (ped.dodgeT || 0) - dt);

    let heading = ped.angle;

    let dodgeHeading = null;
    for (const car of cars) {
      if (Math.abs(car.speed || 0) < 60) continue;
      if (Math.hypot(car.x - ped.x, car.y - ped.y) < 58) {
        dodgeHeading = Math.atan2(ped.y - car.y, ped.x - car.x);
        break;
      }
    }

    if (dodgeHeading !== null) {
      heading = dodgeHeading;
      ped.dodgeT = 0.5;
    } else if (danger && ped.flee > 0) {
      ped.flee -= dt;
      heading = Math.atan2(ped.y - danger.y, ped.x - danger.x);
    } else if (rng.chance(0.004)) {
      heading += rng.pick([-Math.PI / 2, Math.PI / 2, Math.PI]);
    }
    ped.angle = heading;

    let speed = ped.speed;
    if (ped.dodgeT > 0) speed *= 2.8;
    else if (ped.flee > 0) speed *= 2.4;

    const prevX = ped.x;
    const prevY = ped.y;
    ped.x += Math.cos(heading) * speed * dt;
    ped.y += Math.sin(heading) * speed * dt;

    const onCrossing = world.roadsX.some((rx) => Math.abs(ped.x - rx) < 52)
      && world.roadsY.some((ry) => Math.abs(ped.y - ry) < 52);
    if (world.pointInBuilding(ped.x, ped.y)
      || (!world.onSidewalk(ped.x, ped.y) && !onCrossing)) {
      ped.x = prevX;
      ped.y = prevY;
      ped.angle += Math.PI / 2;
    }
    if (ped.x < 20 || ped.y < 20 || ped.x > world.w - 20 || ped.y > world.h - 20) {
      ped.x = prevX;
      ped.y = prevY;
      ped.angle += Math.PI;
    }
  }
}

// ---- police ---------------------------------------------------------------------
//
// Vision is computed once per frame by main.js and passed in as
// { seen, lastSeen }. While seen, units chase the player directly. Once
// sight breaks they drive to the last-seen point and sweep the blocks
// around it. Movement slides along buildings instead of bouncing off them,
// which keeps pursuits tight in the downtown grid.

function wrapAngle(a) {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

export function updatePolice(list, playerPos, dt, world, vision = null) {
  for (const car of list) {
    if (car.kind === 'roadblock' || car.policeState === 'roadblock') {
      car.speed = 0;
      continue;
    }
    const seen = vision ? vision.seen : true;
    if (seen) {
      car.policeState = 'chase';
      car.lastSeen = { x: playerPos.x, y: playerPos.y };
      car.searchT = 0;
    } else if (car.lastSeen) {
      car.policeState = 'search';
    }

    let goal = playerPos;
    if (car.policeState === 'search' && car.lastSeen) {
      car.searchT += dt;
      const reached = car.searchTarget
        && Math.hypot(car.searchTarget.x - car.x, car.searchTarget.y - car.y) < 60;
      if (!car.searchTarget || reached) {
        const sweepAngle = car.searchT * 0.9 + car.id;
        car.searchTarget = world.nearestRoadPoint(
          car.lastSeen.x + Math.cos(sweepAngle) * 190,
          car.lastSeen.y + Math.sin(sweepAngle) * 190,
        );
      }
      goal = car.searchTarget;
    }

    const dx = goal.x - car.x;
    const dy = goal.y - car.y;
    const dist = Math.hypot(dx, dy) || 1;
    const turn = wrapAngle(Math.atan2(dy, dx) - car.angle);
    car.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, turn));

    let cruise = 300;
    if (car.policeState !== 'search') {
      if (dist > 700) cruise = 520;
      else if (dist > 120) cruise = 470;
    }
    car.speed += (cruise - car.speed) * Math.min(1, dt * 1.4);

    const stepX = Math.cos(car.angle) * car.speed * dt;
    const stepY = Math.sin(car.angle) * car.speed * dt;
    const nextX = car.x + stepX;
    const nextY = car.y + stepY;
    if (!world.pointInBuilding(nextX, nextY)) {
      car.x = nextX;
      car.y = nextY;
    } else if (!world.pointInBuilding(nextX, car.y)) {
      car.x = nextX;
    } else if (!world.pointInBuilding(car.x, nextY)) {
      car.y = nextY;
    } else {
      car.angle += Math.PI / 3;
      car.speed *= 0.5;
    }

    if (car.x < 24 || car.y < 24 || car.x > world.w - 24 || car.y > world.h - 24) {
      car.x = Math.max(24, Math.min(world.w - 24, car.x));
      car.y = Math.max(24, Math.min(world.h - 24, car.y));
      car.angle += Math.PI / 2;
    }
  }
}

// Officers fight at range: they hold a 130–300px firing line when they can
// see Mara, close in only when she is very close or very far, and fan out
// around the last-seen point while searching. Firing itself is main.js's
// job — this function only raises `wantsFire`.
export function updateOfficers(list, playerPos, dt, world, vision = null) {
  for (const officer of list) {
    officer.hitFlash = Math.max(0, (officer.hitFlash || 0) - dt);
    officer.shootCd = Math.max(0, (officer.shootCd || 0) - dt);

    const seen = vision ? vision.seen : true;
    let goal = playerPos;
    if (!seen && vision && vision.lastSeen) {
      officer.state = 'search';
      goal = {
        x: vision.lastSeen.x + Math.cos(officer.id) * 90,
        y: vision.lastSeen.y + Math.sin(officer.id) * 90,
      };
    } else {
      officer.state = 'chase';
    }

    const dx = goal.x - officer.x;
    const dy = goal.y - officer.y;
    const goalDist = Math.hypot(dx, dy) || 1;
    const playerDist = Math.hypot(playerPos.x - officer.x, playerPos.y - officer.y) || 1;

    const shouldMove = officer.state === 'search' || playerDist > 300 || playerDist < 110;
    if (shouldMove && goalDist > 24) {
      const speed = playerDist > 260 ? 175 : 150;
      officer.x += (dx / goalDist) * speed * dt;
      officer.y += (dy / goalDist) * speed * dt;
    }
    world.resolveCircle(officer, 12);
    officer.angle = Math.atan2(playerPos.y - officer.y, playerPos.x - officer.x);

    officer.wantsFire = Boolean(
      seen && playerDist >= 110 && playerDist <= 320 && officer.shootCd <= 0,
    );
    if (officer.wantsFire) officer.shootCd = 1.35;
  }
}
