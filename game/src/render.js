// render.js — painting Solmar Bay.
//
// drawWorld() renders one frame of the city in world coordinates (main.js
// applies the camera transform before calling it): ground, water, roads,
// buildings, district dressing, markers, the cast, effects, and finally the
// day-cycle light wash. The HUD and minimap are ui.js's responsibility.
//
// The light deserves a note: dayPhaseAt() turns the normalised dayT owned
// by main.js into a phase label, an in-game clock reading, and a tint that
// is already blended toward the next phase — so the colour drifts over a
// five-minute day instead of snapping at phase boundaries.

import { CFG } from './config.js';

const TINT_PATTERN = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/;

export function parseTint(tint) {
  const match = TINT_PATTERN.exec(tint || '');
  if (!match) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: Number(match[4]) };
}

export function dayPhaseAt(dayT) {
  const phases = CFG.DAY_PHASES;
  const t = ((dayT % 1) + 1) % 1;

  let index = 0;
  for (let i = 0; i < phases.length; i++) {
    if (t >= phases[i].at) index = i;
  }
  const current = phases[index];
  const following = phases[(index + 1) % phases.length];
  const nextStart = index + 1 < phases.length ? phases[index + 1].at : 1;
  const span = (nextStart - current.at) || 1;
  const blend = Math.max(0, Math.min(1, (t - current.at) / span));

  const from = parseTint(current.tint);
  const to = parseTint(following.tint);
  const lerp = (a, b) => Math.round(a + (b - a) * blend);
  const alpha = from.a + (to.a - from.a) * blend;
  const tint = `rgba(${lerp(from.r, to.r)},${lerp(from.g, to.g)},${lerp(from.b, to.b)},${alpha.toFixed(3)})`;

  // Clock mapping: t = 0 is 05:00 and the dial turns once per cycle.
  const hourFloat = (5 + t * 24) % 24;
  const hh = String(Math.floor(hourFloat)).padStart(2, '0');
  const mm = String(Math.floor((hourFloat % 1) * 60)).padStart(2, '0');

  return { label: current.label, tint, clock: `${hh}:${mm}`, index };
}

// ---- small canvas helpers -----------------------------------------------------

function roundedPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function placeMarker(ctx, x, y, label, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label[0], x, y + 3);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(label, x, y - 18);
}

// ---- vehicles -------------------------------------------------------------------

function paintCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const { w, h } = car;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);

  ctx.fillStyle = car.color;
  roundedPath(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(20,30,40,0.85)';
  roundedPath(ctx, -w * 0.18, -h / 2 + 3, w * 0.34, h - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.5)';
  ctx.fillRect(w * 0.16, -h / 2 + 4, 4, h - 8);

  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 5);
  ctx.fillRect(w / 2 - 2, h / 2 - 8, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-w / 2, -h / 2 + 3, 3, 5);
  ctx.fillRect(-w / 2, h / 2 - 8, 3, 5);

  if (car.kind === 'police') paintPoliceTrim(ctx, h, time);
  if (car.isRepo) paintTag(ctx, '★ REPO', '#ffe600', h);
  if (car.isExport) {
    paintTag(ctx, '▼ EXPORT', '#2ecc71', h);
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
  }
  if (car.kind === 'roadblock') paintTag(ctx, 'ROADBLOCK', '#ffe600', h);
  if (car.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.8, car.hitFlash * 2);
    ctx.fillStyle = '#fff';
    roundedPath(ctx, -w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function paintPoliceTrim(ctx, h, time) {
  const firstPhase = Math.floor(time * 6) % 2 === 0;
  ctx.fillStyle = firstPhase ? '#ff2d2d' : '#2d7bff';
  ctx.fillRect(-6, -h / 2 - 2, 12, 5);
  ctx.fillStyle = firstPhase ? '#2d7bff' : '#ff2d2d';
  ctx.fillRect(-6, h / 2 - 3, 12, 5);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POLICE', 0, 3);
}

function paintTag(ctx, text, color, h) {
  ctx.fillStyle = color;
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, -h / 2 - 6);
}

// ---- people -----------------------------------------------------------------------

function paintPedestrian(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.dead) {
    ctx.globalAlpha = 0.55;
    ctx.rotate(Math.PI / 2);
  }
  if (ped.hitFlash > 0) {
    ctx.strokeStyle = '#ff5b4d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 14 + (0.35 - ped.hitFlash) * 22, 0, Math.PI * 2);
    ctx.stroke();
  }
  const bob = Math.sin(ped.walkPhase) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c2c2c';
  ctx.beginPath();
  ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 + bob * 0.3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintPlayer(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mara's silhouette: red jacket, skin tone, dark hair, pistol tick.
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5d0a9';
  ctx.beginPath();
  ctx.arc(5, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c1a12';
  ctx.beginPath();
  ctx.arc(2, -3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(18, 0);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MARA', player.x, player.y - 18);
}

function paintOfficer(ctx, officer) {
  ctx.save();
  ctx.translate(officer.x, officer.y);
  if (officer.hitFlash > 0) {
    ctx.strokeStyle = '#ff5b4d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#1f3a93';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PD', 0, 3);
  ctx.restore();
  if (officer.state === 'search') {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', officer.x, officer.y - 16);
  }
}

// ---- district dressing ---------------------------------------------------------------

function paintPalm(ctx, palm, time) {
  const s = palm.s || 1;
  // Fronds sway in the sea breeze; the phase is derived from position so
  // neighbouring trees never move in lockstep.
  const sway = Math.sin(time * 0.9 + palm.x * 0.013 + palm.y * 0.007) * 0.09;
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(palm.x - 2 * s, palm.y - 2 * s, 4 * s, 10 * s);
  ctx.strokeStyle = '#2e7d32';
  ctx.lineWidth = 3 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + palm.x * 0.01 + sway;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y - 2 * s);
    ctx.quadraticCurveTo(
      palm.x + Math.cos(a) * 10 * s, palm.y - 8 * s,
      palm.x + Math.cos(a) * 16 * s, palm.y + 2 * s,
    );
    ctx.stroke();
  }
}

function inView(x, y, x0, y0, vw, vh, margin) {
  return x >= x0 - margin && y >= y0 - margin && x <= x0 + vw + margin && y <= y0 + vh + margin;
}

function paintDressing(ctx, world, x0, y0, vw, vh, time) {
  const deco = world.decorations;
  if (!deco) return;

  ctx.fillStyle = 'rgba(240,240,240,0.65)';
  for (const crossing of deco.crosswalks) {
    if (!inView(crossing.x, crossing.y, x0, y0, vw, vh, 70)) continue;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(crossing.x - 27, crossing.y - 58 + i * 7, 54, 4);
      ctx.fillRect(crossing.x - 58 + i * 7, crossing.y - 27, 4, 54);
    }
  }

  for (const towel of deco.towels || []) {
    if (!inView(towel.x, towel.y, x0, y0, vw, vh, 30)) continue;
    ctx.save();
    ctx.translate(towel.x, towel.y);
    ctx.rotate(towel.a || 0);
    ctx.fillStyle = towel.color;
    ctx.fillRect(-7, -11, 14, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-7, -3, 14, 5);
    ctx.restore();
  }

  for (const umbrella of deco.umbrellas) {
    if (!inView(umbrella.x, umbrella.y, x0, y0, vw, vh, 30)) continue;
    ctx.fillStyle = umbrella.color;
    ctx.beginPath();
    ctx.arc(umbrella.x, umbrella.y, 13, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#6b4a2a';
    ctx.beginPath();
    ctx.moveTo(umbrella.x, umbrella.y);
    ctx.lineTo(umbrella.x, umbrella.y + 10);
    ctx.stroke();
  }

  for (const palm of deco.palms) {
    if (inView(palm.x, palm.y, x0, y0, vw, vh, 40)) paintPalm(ctx, palm, time);
  }

  ctx.textAlign = 'center';
  for (const sign of deco.signs) {
    if (!inView(sign.x, sign.y, x0, y0, vw, vh, 90)) continue;
    ctx.fillStyle = sign.kind === 'motel' ? '#3a1030' : '#20242c';
    ctx.fillRect(sign.x - 52, sign.y - 12, 104, 24);
    ctx.strokeStyle = sign.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(sign.x - 52, sign.y - 12, 104, 24);
    ctx.fillStyle = sign.color;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(sign.text, sign.x, sign.y + 4);
  }

  for (const crane of deco.cranes) {
    ctx.strokeStyle = crane.main ? '#f39c12' : '#7f8c8d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(crane.x - 34, crane.y + 40);
    ctx.lineTo(crane.x - 34, crane.y + 40 - crane.h);
    ctx.lineTo(crane.x + 58, crane.y + 40 - crane.h);
    ctx.lineTo(crane.x + 58, crane.y + 40 - crane.h + 26);
    ctx.moveTo(crane.x + 34, crane.y + 40);
    ctx.lineTo(crane.x + 34, crane.y + 40 - crane.h);
    ctx.stroke();
    ctx.fillStyle = crane.main ? '#f39c12' : '#7f8c8d';
    ctx.fillRect(crane.x - 42, crane.y + 34, 84, 8);
    if (crane.main) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('EXPORT', crane.x, crane.y + 58);
    }
  }
}

// ---- terrain ---------------------------------------------------------------------------

function paintTerrain(ctx, G, x0, y0, vw, vh, time) {
  const { world } = G;
  ctx.fillStyle = CFG.COLORS.grass;
  ctx.fillRect(x0, y0, vw, vh);

  // Checkerboard mow pattern, aligned to a fixed grid so it never swims.
  ctx.fillStyle = CFG.COLORS.grass2;
  const cell = 160;
  for (let gx = Math.floor(x0 / cell) * cell; gx < x0 + vw; gx += cell) {
    for (let gy = Math.floor(y0 / cell) * cell; gy < y0 + vh; gy += cell) {
      if (((gx / cell) + (gy / cell)) % 2 === 0) ctx.fillRect(gx, gy, cell, cell);
    }
  }

  if (world.beachX < x0 + vw) {
    ctx.fillStyle = CFG.COLORS.sand;
    ctx.fillRect(world.beachX, y0, 90, vh);
    ctx.fillStyle = CFG.COLORS.ocean;
    ctx.fillRect(world.beachX + 90, y0, vw, vh);
    ctx.fillStyle = CFG.COLORS.oceanDeep;
    for (let wy = Math.floor(y0 / 90) * 90; wy < y0 + vh; wy += 90) {
      const wobble = Math.sin(time * 1.2 + wy * 0.05) * 8;
      ctx.fillRect(world.beachX + 90 + wobble, wy, 60, 4);
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SOLMAR BEACH', world.beachX + 8, y0 + 26);
  }

  ctx.fillStyle = '#6b5a44';
  ctx.fillRect(world.port.x, world.port.y, world.port.w, world.port.h);
  ctx.fillStyle = CFG.COLORS.ocean;
  ctx.fillRect(world.port.x, world.port.y + world.port.h - 40, world.port.w, 40);
  for (const box of world.containers) {
    ctx.fillStyle = box.color;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('PORT OF SOLMAR', world.port.x + 10, world.port.y + 22);

  ctx.fillStyle = CFG.COLORS.road;
  for (const rx of world.roadsX) ctx.fillRect(rx - CFG.ROAD_W / 2, 0, CFG.ROAD_W, world.h);
  for (const ry of world.roadsY) ctx.fillRect(0, ry - CFG.ROAD_W / 2, world.w, CFG.ROAD_W);

  ctx.fillStyle = CFG.COLORS.sidewalk;
  for (const rx of world.roadsX) {
    ctx.fillRect(rx - CFG.ROAD_W / 2 - 16, 0, 16, world.h);
    ctx.fillRect(rx + CFG.ROAD_W / 2, 0, 16, world.h);
  }
  for (const ry of world.roadsY) {
    ctx.fillRect(0, ry - CFG.ROAD_W / 2 - 16, world.w, 16);
    ctx.fillRect(0, ry + CFG.ROAD_W / 2, world.w, 16);
  }

  ctx.strokeStyle = CFG.COLORS.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const rx of world.roadsX) {
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx, world.h);
  }
  for (const ry of world.roadsY) {
    ctx.moveTo(0, ry);
    ctx.lineTo(world.w, ry);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const building of world.buildings) {
    if (building.x > x0 + vw || building.y > y0 + vh
      || building.x + building.w < x0 || building.y + building.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(building.x + 5, building.y + 6, building.w, building.h);
    ctx.fillStyle = building.color;
    ctx.fillRect(building.x, building.y, building.w, building.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(building.x + 3, building.y + 3, building.w - 6, building.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(building.x + 8, building.y + 8, Math.min(26, building.w - 16), Math.min(18, building.h - 16));
  }
}

// ---- the frame ---------------------------------------------------------------------------

export function drawWorld(ctx, G, cam, time) {
  const { world } = G;
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const x0 = cam.x - vw / 2;
  const y0 = cam.y - vh / 2;

  paintTerrain(ctx, G, x0, y0, vw, vh, time);
  paintDressing(ctx, world, x0, y0, vw, vh, time);

  placeMarker(ctx, world.bank.x, world.bank.y, 'BANK', '#f1c40f');
  placeMarker(ctx, world.garage.x, world.garage.y, 'GARAGE', '#3498db');
  placeMarker(ctx, world.safehouse.x, world.safehouse.y, 'SAFEHOUSE', '#2ecc71');
  placeMarker(ctx, world.hideout.x, world.hideout.y, 'HIDEOUT', '#9b59b6');
  placeMarker(ctx, world.delia.x, world.delia.y, "DELIA'S", '#e67e22');

  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 4;
  for (const mark of G.skid) {
    ctx.globalAlpha = Math.max(0, mark.life);
    ctx.beginPath();
    ctx.moveTo(mark.x, mark.y);
    ctx.lineTo(mark.x + Math.cos(mark.angle) * 14, mark.y + Math.sin(mark.angle) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (G.searching && G.lastSeen) {
    const radius = 60 + Math.sin(time * 3) * 22;
    ctx.strokeStyle = 'rgba(255,215,0,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(G.lastSeen.x, G.lastSeen.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LAST SEEN', G.lastSeen.x, G.lastSeen.y - radius - 8);
  }

  const objective = G.currentObjective();
  if (objective.target) {
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(objective.target.x, objective.target.y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,0,0.25)';
    ctx.beginPath();
    ctx.arc(objective.target.x, objective.target.y, 26 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,0,0.18)';
    ctx.fillRect(objective.target.x - 3, objective.target.y - 130, 6, 130);
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼', objective.target.x, objective.target.y - 132);
  }

  if (G.exportCar) {
    const crane = CFG.PORT_CRANE;
    const ring = crane.radius * (1 + Math.sin(time * 4) * 0.05);
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(crane.x, crane.y, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(46,204,113,0.16)';
    ctx.beginPath();
    ctx.arc(crane.x, crane.y, crane.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const car of G.parked) paintCar(ctx, car, time);
  for (const car of G.traffic) paintCar(ctx, car, time);
  for (const car of G.police) paintCar(ctx, car, time);
  for (const car of G.roadblocks || []) paintCar(ctx, car, time);
  for (const ped of G.peds) paintPedestrian(ctx, ped);
  for (const officer of G.officers) paintOfficer(ctx, officer);
  if (G.player.inCar && G.player.car) paintCar(ctx, G.player.car, time);
  else paintPlayer(ctx, G.player);

  for (const particle of G.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  for (const floating of G.floatTexts) {
    ctx.globalAlpha = Math.max(0, floating.life);
    ctx.fillStyle = floating.color;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(floating.text, floating.x, floating.y);
  }
  ctx.globalAlpha = 1;

  paintDaylight(ctx, G, cam, x0, y0, vw, vh);
}

// The light goes on last: a flat phase wash plus a warm vignette that
// deepens with the wash, so dusk and nightfall feel heavier than midday.
function paintDaylight(ctx, G, cam, x0, y0, vw, vh) {
  const phase = dayPhaseAt(G.dayT ?? CFG.DAY_START);
  const parsed = parseTint(phase.tint);
  if (parsed.a > 0.003) {
    ctx.fillStyle = phase.tint;
    ctx.fillRect(x0, y0, vw, vh);
  }
  const strength = 0.08 + parsed.a * 0.55;
  const gradient = ctx.createRadialGradient(cam.x, cam.y, vh * 0.35, cam.x, cam.y, vh * 0.95);
  gradient.addColorStop(0, 'rgba(255,170,80,0)');
  gradient.addColorStop(1, `rgba(255,120,40,${strength.toFixed(3)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x0, y0, vw, vh);
}
