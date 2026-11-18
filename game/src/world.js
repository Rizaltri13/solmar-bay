// City generation: road grid, blocks, buildings, beach + ocean, port docks,
// and the key story locations. Collision helpers live here too.
import { CFG } from './config.js';

export function createWorld(rng) {
  const W = CFG.WORLD_W, H = CFG.WORLD_H, S = CFG.ROAD_SPACING;
  const roadsX = [], roadsY = [];
  for (let x = S; x < W - 100; x += S) roadsX.push(x);
  for (let y = S; y < H - 100; y += S) roadsY.push(y);

  const buildings = [];
  const containers = [];
  // One or two buildings per block (blocks are the cells between roads).
  for (let bx = 0; bx < roadsX.length; bx++) {
    for (let by = 0; by < roadsY.length; by++) {
      const x0 = roadsX[bx] + CFG.ROAD_W / 2 + 14;
      const y0 = roadsY[by] + CFG.ROAD_W / 2 + 14;
      const x1 = (bx + 1 < roadsX.length ? roadsX[bx + 1] : W - 60) - CFG.ROAD_W / 2 - 14;
      const y1 = (by + 1 < roadsY.length ? roadsY[by + 1] : H - 60) - CFG.ROAD_W / 2 - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // Skip the beach strip and the port corner so the map stays open there.
      if (x0 > CFG.BEACH_X - 40) continue;
      if (x0 < 700 && y0 > 1500) continue;
      const n = rng.chance(0.45) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const bw = rng.range(70, Math.max(80, (x1 - x0) / n - 16));
        const bh = rng.range(60, y1 - y0 - 20);
        const px = x0 + (n === 2 ? i * ((x1 - x0) / 2) + 6 : rng.range(0, Math.max(1, x1 - x0 - bw)));
        const py = y0 + rng.range(0, Math.max(1, y1 - y0 - bh));
        buildings.push({
          x: px, y: py, w: bw, h: bh,
          color: rng.pick(CFG.COLORS.buildingRoof),
          hgt: rng.int(1, 4),
        });
      }
    }
  }
  // Port containers (south-west docks).
  for (let i = 0; i < 10; i++) {
    containers.push({
      x: 340 + (i % 5) * 120, y: 1640 + Math.floor(i / 5) * 70, w: 96, h: 44,
      color: rng.pick(['#b3541e', '#2e86ab', '#7a9e3f', '#c9a227', '#8e44ad']),
    });
  }

  // --- District dressing: palms, beach umbrellas, storefront + motel signs,
  // port cranes and crosswalks make each neighbourhood read at a glance ---
  const decorations = buildDistrictDecorations(rng, roadsX, roadsY);

  const world = {
    w: W, h: H, roadsX, roadsY, buildings, containers, decorations,
    districts: CFG.DISTRICTS,
    beachX: CFG.BEACH_X,
    port: CFG.PORT, portCrane: CFG.PORT_CRANE,
    safehouse: CFG.SAFEHOUSE, bank: CFG.BANK, garage: CFG.GARAGE,
    hideout: CFG.HIDEOUT, delia: CFG.DELIA, spawn: CFG.SPAWN,
  };
  world.districtAt = (x, y) => CFG.DISTRICTS.find((d) => x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) || null;
  // Line of sight: true when a building blocks the straight line a→b.
  // Bullets and police vision both use this one occlusion test.
  world.lineBlocked = (x1, y1, x2, y2) => {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.floor(dist / 18));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (world.pointInBuilding(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
    }
    return false;
  };
  world.canSee = (x1, y1, x2, y2, range = CFG.SIGHT_RANGE) =>
    Math.hypot(x2 - x1, y2 - y1) <= range && !world.lineBlocked(x1, y1, x2, y2);

  world.isRoad = (x, y) => {
    if (x < 0 || y < 0 || x > W || y > H) return false;
    for (const rx of roadsX) if (Math.abs(x - rx) < CFG.ROAD_W / 2) return true;
    for (const ry of roadsY) if (Math.abs(y - ry) < CFG.ROAD_W / 2) return true;
    return false;
  };
  world.onSidewalk = (x, y) => {
    if (x < 0 || y < 0 || x > W || y > H) return false;
    for (const rx of roadsX) {
      const d = Math.abs(x - rx);
      if (d >= CFG.ROAD_W / 2 && d < CFG.ROAD_W / 2 + 22) return true;
    }
    for (const ry of roadsY) {
      const d = Math.abs(y - ry);
      if (d >= CFG.ROAD_W / 2 && d < CFG.ROAD_W / 2 + 22) return true;
    }
    return false;
  };
  world.pointInBuilding = (x, y) => {
    for (const b of buildings) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
    return null;
  };
  // Push a circle out of buildings; returns true if a collision happened.
  world.resolveCircle = (o, r) => {
    let hit = false;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(o.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(o.y, b.y + b.h));
      const dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          o.x = cx + (dx / d) * r; o.y = cy + (dy / d) * r;
        } else { o.x = b.x - r; }
      }
    }
    o.x = Math.max(20, Math.min(W - 20, o.x));
    o.y = Math.max(20, Math.min(H - 20, o.y));
    return hit;
  };
  world.randomRoadPoint = (rng2) => {
    if (rng2.chance(0.5)) return { x: rng2.pick(roadsX) + rng2.range(-14, 14), y: rng2.range(120, H - 120) };
    return { x: rng2.range(120, W - 120), y: rng2.pick(roadsY) + rng2.range(-14, 14) };
  };
  // A roadblock anchor: the intersection just ahead of a fleeing driver.
  world.roadblockAhead = (x, y, angle) => {
    const tx = x + Math.cos(angle) * 430, ty = y + Math.sin(angle) * 430;
    return world.nearestRoadPoint(Math.max(80, Math.min(W - 80, tx)), Math.max(80, Math.min(H - 80, ty)));
  };
  world.nearestRoadPoint = (x, y) => {
    let best = null, bd = 1e9;
    for (const rx of roadsX) for (const ry of roadsY) {
      const d = (x - rx) * (x - rx) + (y - ry) * (y - ry);
      if (d < bd) { bd = d; best = { x: rx, y: ry }; }
    }
    return best;
  };
  return world;
}

// Deterministic dressing per district, generated once from the seeded RNG.
export function buildDistrictDecorations(rng, roadsX, roadsY) {
  const palms = [], umbrellas = [], signs = [], cranes = [], crosswalks = [];
  // Palm trees: beach fringe, Palm Heights, and scattered road corners.
  for (let y = 140; y < CFG.WORLD_H - 80; y += 150) palms.push({ x: CFG.BEACH_X - 26, y: y + rng.range(-18, 18), s: rng.range(0.85, 1.25) });
  for (let i = 0; i < 26; i++) palms.push({ x: rng.range(980, 1800), y: rng.range(1280, 1760), s: rng.range(0.8, 1.2) });
  for (const rx of roadsX) for (const ry of roadsY) if (rng.chance(0.3)) palms.push({ x: rx + 52, y: ry + 52, s: rng.range(0.75, 1.1) });
  // Beach umbrellas in bright stripes along the sand, + towels between them.
  const towels = [];
  for (let i = 0; i < 14; i++) umbrellas.push({ x: CFG.BEACH_X + rng.range(14, 62), y: 180 + i * 118 + rng.range(-24, 24), color: rng.pick(['#e74c3c', '#f1c40f', '#16a085', '#e67e22', '#ecf0f1']) });
  for (let i = 0; i < 18; i++) towels.push({ x: CFG.BEACH_X + rng.range(8, 70), y: rng.range(140, CFG.WORLD_H - 140), color: rng.pick(['#ff6b9d', '#4aa3ff', '#ffd166', '#7bd88f']), a: rng.range(-0.4, 0.4) });
  // Storefront signs downtown + motel signs on Motel Row / the marina.
  const downtown = CFG.SIGN_TEXTS.slice(0, 8), motels = ['MOTEL SOLMAR', 'PALM MOTEL', 'HOTEL MAR', 'MOTEL SOLMAR'];
  downtown.forEach((text, i) => signs.push({ x: 980 + (i % 4) * 230, y: 300 + Math.floor(i / 4) * 300, text, color: rng.pick(['#ffb347', '#2ecc71', '#4aa3ff', '#ff6b9d']), kind: 'shop' }));
  motels.forEach((text, i) => signs.push({ x: 330 + i * 150, y: 900 + (i % 2) * 260, text, color: '#ff6b9d', kind: 'motel' }));
  signs.push({ x: 1620, y: 900, text: 'MARINA', color: '#4aa3ff', kind: 'shop' });
  signs.push({ x: 1900, y: 300, text: 'BAY FEDERAL', color: '#f1c40f', kind: 'shop' });
  // Port cranes over the docks (the vehicle-export drop-off sits under #1).
  cranes.push({ x: CFG.PORT_CRANE.x, y: CFG.PORT_CRANE.y - 60, h: 120, main: true });
  cranes.push({ x: 760, y: 1620, h: 100, main: false });
  cranes.push({ x: 880, y: 1760, h: 110, main: false });
  // Zebra crosswalks at every intersection.
  for (const rx of roadsX) for (const ry of roadsY) crosswalks.push({ x: rx, y: ry });
  return { palms, umbrellas, signs, cranes, crosswalks, towels };
}
