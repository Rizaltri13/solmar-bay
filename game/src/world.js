// world.js — building Solmar Bay and answering spatial questions about it.
//
// createWorld() lays out the road grid, fills the blocks with buildings,
// stacks the port containers and scatters the district dressing (palms,
// umbrellas, signs, cranes, crosswalks). The returned object also carries
// every spatial helper the rest of the game needs: road tests, building
// tests, circle resolution, line-of-sight occlusion and road snapping.

import { CFG } from './config.js';

const CONTAINER_PAINTS = ['#b3541e', '#2e86ab', '#7a9e3f', '#c9a227', '#8e44ad'];
const UMBRELLA_PAINTS = ['#e74c3c', '#f1c40f', '#16a085', '#e67e22', '#ecf0f1'];
const TOWEL_PAINTS = ['#ff6b9d', '#4aa3ff', '#ffd166', '#7bd88f'];
const SIGN_PAINTS = ['#ffb347', '#2ecc71', '#4aa3ff', '#ff6b9d'];

function roadLines(limit) {
  const lines = [];
  for (let v = CFG.ROAD_SPACING; v < limit - 100; v += CFG.ROAD_SPACING) lines.push(v);
  return lines;
}

function layOutBuildings(rng, roadsX, roadsY) {
  const result = [];
  const halfRoad = CFG.ROAD_W / 2;
  for (let bx = 0; bx < roadsX.length; bx++) {
    for (let by = 0; by < roadsY.length; by++) {
      const left = roadsX[bx] + halfRoad + 14;
      const top = roadsY[by] + halfRoad + 14;
      const right = (bx + 1 < roadsX.length ? roadsX[bx + 1] : CFG.WORLD_W - 60) - halfRoad - 14;
      const bottom = (by + 1 < roadsY.length ? roadsY[by + 1] : CFG.WORLD_H - 60) - halfRoad - 14;
      const blockW = right - left;
      const blockH = bottom - top;
      if (blockW < 90 || blockH < 90) continue;
      // Keep the beach strip and the port apron open — no towers there.
      if (left > CFG.BEACH_X - 40) continue;
      if (left < 700 && top > 1500) continue;
      const count = rng.chance(0.45) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = rng.range(70, Math.max(80, blockW / count - 16));
        const h = rng.range(60, blockH - 20);
        const x = count === 2
          ? left + i * (blockW / 2) + 6
          : left + rng.range(0, Math.max(1, blockW - w));
        const y = top + rng.range(0, Math.max(1, blockH - h));
        result.push({
          x, y, w, h,
          color: rng.pick(CFG.COLORS.buildingRoof),
          hgt: rng.int(1, 4),
        });
      }
    }
  }
  return result;
}

function stackContainers(rng) {
  const result = [];
  for (let i = 0; i < 10; i++) {
    result.push({
      x: 340 + (i % 5) * 120,
      y: 1640 + Math.floor(i / 5) * 70,
      w: 96,
      h: 44,
      color: rng.pick(CONTAINER_PAINTS),
    });
  }
  return result;
}

// District dressing is generated once, deterministically, from the world
// seed. It is pure decoration — but it is what makes each neighbourhood
// recognisable from the driver's seat and from the minimap.
export function buildDistrictDecorations(rng, roadsX, roadsY) {
  const palms = [];
  const umbrellas = [];
  const signs = [];
  const cranes = [];
  const crosswalks = [];
  const towels = [];

  // Palms: a fringe along the beach, a grove in Palm Heights, and the odd
  // corner tree at intersections elsewhere in the city.
  for (let y = 140; y < CFG.WORLD_H - 80; y += 150) {
    palms.push({ x: CFG.BEACH_X - 26, y: rng.jitter(y, 18), s: rng.range(0.85, 1.25) });
  }
  for (let i = 0; i < 26; i++) {
    palms.push({
      x: rng.range(980, 1800),
      y: rng.range(1280, 1760),
      s: rng.clampedRange(0.8, 1.2, 0.8, 1.2),
    });
  }
  for (const rx of roadsX) {
    for (const ry of roadsY) {
      if (rng.chance(0.3)) palms.push({ x: rx + 52, y: ry + 52, s: rng.range(0.75, 1.1) });
    }
  }

  // Beach furniture: striped umbrellas in a loose row, towels between them.
  for (let i = 0; i < 14; i++) {
    umbrellas.push({
      x: CFG.BEACH_X + rng.range(14, 62),
      y: 180 + i * 118 + rng.range(-24, 24),
      color: rng.pick(UMBRELLA_PAINTS),
    });
  }
  for (let i = 0; i < 18; i++) {
    towels.push({
      x: CFG.BEACH_X + rng.range(8, 70),
      y: rng.range(140, CFG.WORLD_H - 140),
      color: rng.pick(TOWEL_PAINTS),
      a: rng.range(-0.4, 0.4),
    });
  }

  // Signs: shopfronts downtown, motel boards on Motel Row, plus two
  // one-off landmarks (the marina and the bank) that help navigation.
  CFG.SIGN_TEXTS.slice(0, 8).forEach((text, i) => {
    signs.push({
      x: 980 + (i % 4) * 230,
      y: 300 + Math.floor(i / 4) * 300,
      text,
      color: rng.pick(SIGN_PAINTS),
      kind: 'shop',
    });
  });
  ['MOTEL SOLMAR', 'PALM MOTEL', 'HOTEL MAR', 'MOTEL SOLMAR'].forEach((text, i) => {
    signs.push({ x: 330 + i * 150, y: 900 + (i % 2) * 260, text, color: '#ff6b9d', kind: 'motel' });
  });
  signs.push({ x: 1620, y: 900, text: 'MARINA', color: '#4aa3ff', kind: 'shop' });
  signs.push({ x: 1900, y: 300, text: 'BAY FEDERAL', color: '#f1c40f', kind: 'shop' });

  // Gantry cranes over the docks. The main crane is the export drop-off.
  cranes.push({ x: CFG.PORT_CRANE.x, y: CFG.PORT_CRANE.y - 60, h: 120, main: true });
  cranes.push({ x: 760, y: 1620, h: 100, main: false });
  cranes.push({ x: 880, y: 1760, h: 110, main: false });

  for (const rx of roadsX) {
    for (const ry of roadsY) crosswalks.push({ x: rx, y: ry });
  }

  return { palms, umbrellas, signs, cranes, crosswalks, towels };
}

export function createWorld(rng) {
  const roadsX = roadLines(CFG.WORLD_W);
  const roadsY = roadLines(CFG.WORLD_H);
  const buildings = layOutBuildings(rng, roadsX, roadsY);
  const containers = stackContainers(rng);
  const decorations = buildDistrictDecorations(rng, roadsX, roadsY);

  const world = {
    w: CFG.WORLD_W,
    h: CFG.WORLD_H,
    roadsX,
    roadsY,
    buildings,
    containers,
    decorations,
    districts: CFG.DISTRICTS,
    beachX: CFG.BEACH_X,
    port: CFG.PORT,
    portCrane: CFG.PORT_CRANE,
    safehouse: CFG.SAFEHOUSE,
    bank: CFG.BANK,
    garage: CFG.GARAGE,
    hideout: CFG.HIDEOUT,
    delia: CFG.DELIA,
    spawn: CFG.SPAWN,
  };

  world.districtAt = (x, y) => {
    for (const d of CFG.DISTRICTS) {
      if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
    }
    return null;
  };

  world.distanceToRoad = (x, y) => {
    let nearest = Infinity;
    for (const rx of roadsX) nearest = Math.min(nearest, Math.abs(x - rx));
    for (const ry of roadsY) nearest = Math.min(nearest, Math.abs(y - ry));
    return nearest;
  };

  world.nearRoad = (x, y, slack = 10) => world.distanceToRoad(x, y) <= CFG.ROAD_W / 2 + slack;

  world.pointInBuilding = (x, y) => {
    for (const b of buildings) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
    }
    return null;
  };

  // Occlusion test shared by bullets and police vision: walk the segment
  // in small steps and report whether any sample lands inside a building.
  // The step is deliberately small so a thin corner cannot be jumped over.
  world.lineBlocked = (x1, y1, x2, y2) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.floor(length / 12));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (world.pointInBuilding(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
    }
    return false;
  };

  world.canSee = (x1, y1, x2, y2, range = CFG.SIGHT_RANGE) => {
    if (Math.hypot(x2 - x1, y2 - y1) > range) return false;
    return !world.lineBlocked(x1, y1, x2, y2);
  };

  world.isRoad = (x, y) => {
    if (x < 0 || y < 0 || x > world.w || y > world.h) return false;
    const half = CFG.ROAD_W / 2;
    return roadsX.some((rx) => Math.abs(x - rx) < half)
      || roadsY.some((ry) => Math.abs(y - ry) < half);
  };

  world.onSidewalk = (x, y) => {
    if (x < 0 || y < 0 || x > world.w || y > world.h) return false;
    const half = CFG.ROAD_W / 2;
    const beside = (v, lines) => lines.some((line) => {
      const d = Math.abs(v - line);
      return d >= half && d < half + 22;
    });
    return beside(x, roadsX) || beside(y, roadsY);
  };

  // Push a circle out of every building it overlaps and clamp it to the
  // world bounds. Returns true when at least one push happened.
  world.resolveCircle = (obj, radius) => {
    let collided = false;
    for (const b of buildings) {
      const closestX = Math.max(b.x, Math.min(obj.x, b.x + b.w));
      const closestY = Math.max(b.y, Math.min(obj.y, b.y + b.h));
      const dx = obj.x - closestX;
      const dy = obj.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radius * radius) continue;
      collided = true;
      if (distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        obj.x = closestX + (dx / dist) * radius;
        obj.y = closestY + (dy / dist) * radius;
      } else {
        obj.x = b.x - radius;
      }
    }
    obj.x = Math.max(20, Math.min(world.w - 20, obj.x));
    obj.y = Math.max(20, Math.min(world.h - 20, obj.y));
    return collided;
  };

  world.randomRoadPoint = (rng2) => {
    if (rng2.chance(0.5)) {
      return { x: rng2.pick(roadsX) + rng2.range(-14, 14), y: rng2.range(120, world.h - 120) };
    }
    return { x: rng2.range(120, world.w - 120), y: rng2.pick(roadsY) + rng2.range(-14, 14) };
  };

  world.nearestRoadPoint = (x, y) => {
    let bestPoint = null;
    let bestDistSq = Infinity;
    for (const rx of roadsX) {
      for (const ry of roadsY) {
        const d = (x - rx) * (x - rx) + (y - ry) * (y - ry);
        if (d < bestDistSq) {
          bestDistSq = d;
          bestPoint = { x: rx, y: ry };
        }
      }
    }
    return bestPoint;
  };

  // Every intersection, as fresh {x, y} points — spawn logic and the
  // roadblock anchor both think in intersections, not raw line pairs.
  world.intersections = () => {
    const points = [];
    for (const rx of roadsX) for (const ry of roadsY) points.push({ x: rx, y: ry });
    return points;
  };

  // Where a roadblock should wait: the intersection roughly 430px ahead
  // of a fleeing driver, clamped inside the city.
  world.roadblockAhead = (x, y, angle) => {
    const aheadX = x + Math.cos(angle) * 430;
    const aheadY = y + Math.sin(angle) * 430;
    return world.nearestRoadPoint(
      Math.max(80, Math.min(world.w - 80, aheadX)),
      Math.max(80, Math.min(world.h - 80, aheadY)),
    );
  };

  return world;
}
