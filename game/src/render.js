// Everything painted on the canvas: the city, the cast, effects, and the
// sunset light that gives Solmar Bay its look. HUD/minimap live in ui.js.
import { CFG } from './config.js';

function drawCar(ctx, c, time) {
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(c.angle);
  const w = c.w, h = c.h;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
  // body
  ctx.fillStyle = c.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6); ctx.fill();
  // cabin / windshield
  ctx.fillStyle = 'rgba(20,30,40,0.85)';
  roundRect(ctx, -w * 0.18, -h / 2 + 3, w * 0.34, h - 6, 4); ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.5)';
  ctx.fillRect(w * 0.16, -h / 2 + 4, 4, h - 8);
  // headlights + taillights
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 5); ctx.fillRect(w / 2 - 2, h / 2 - 8, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-w / 2, -h / 2 + 3, 3, 5); ctx.fillRect(-w / 2, h / 2 - 8, 3, 5);
  if (c.kind === 'police') {
    // light bar, flashing red/blue
    const on = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff2d2d' : '#2d7bff';
    ctx.fillRect(-6, -h / 2 - 2, 12, 5);
    ctx.fillStyle = on ? '#2d7bff' : '#ff2d2d';
    ctx.fillRect(-6, h / 2 - 3, 12, 5);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
  }
  if (c.isRepo) {
    ctx.fillStyle = '#ffe600'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('★ REPO', 0, -h / 2 - 6);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPed(ctx, p, time) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const bob = Math.sin(p.walkPhase) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 2, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(0, bob * 0.3, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c2c2c';
  ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3 + bob * 0.3, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, p, time) {
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(1, 3, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  // Mara: red jacket, dark hair
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5d0a9';
  ctx.beginPath(); ctx.arc(5, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c1a12';
  ctx.beginPath(); ctx.arc(2, -3, 6, 0, Math.PI * 2); ctx.fill();
  // pistol direction tick
  ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(18, 0); ctx.stroke();
  ctx.restore();
  // name tag
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('MARA', p.x, p.y - 18);
}

export function drawWorld(ctx, G, cam, time) {
  const { world } = G;
  const vw = ctx.canvas.width, vh = ctx.canvas.height;
  const x0 = cam.x - vw / 2, y0 = cam.y - vh / 2;

  // Ground: grass base
  ctx.fillStyle = CFG.COLORS.grass;
  ctx.fillRect(x0, y0, vw, vh);
  // subtle grass patchwork
  ctx.fillStyle = CFG.COLORS.grass2;
  const gs = 160;
  for (let gx = Math.floor(x0 / gs) * gs; gx < x0 + vw; gx += gs)
    for (let gy = Math.floor(y0 / gs) * gs; gy < y0 + vh; gy += gs)
      if (((gx / gs) + (gy / gs)) % 2 === 0) ctx.fillRect(gx, gy, gs, gs);

  // Ocean + beach (east edge)
  if (world.beachX < x0 + vw) {
    ctx.fillStyle = CFG.COLORS.sand;
    ctx.fillRect(world.beachX, y0, 90, vh);
    ctx.fillStyle = CFG.COLORS.ocean;
    ctx.fillRect(world.beachX + 90, y0, vw, vh);
    ctx.fillStyle = CFG.COLORS.oceanDeep;
    for (let wy = Math.floor(y0 / 90) * 90; wy < y0 + vh; wy += 90) {
      const wob = Math.sin(time * 1.2 + wy * 0.05) * 8;
      ctx.fillRect(world.beachX + 90 + wob, wy, 60, 4);
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('SOLMAR BEACH', world.beachX + 8, y0 + 26);
  }
  // Port docks (south-west)
  ctx.fillStyle = '#6b5a44';
  ctx.fillRect(world.port.x, world.port.y, world.port.w, world.port.h);
  ctx.fillStyle = CFG.COLORS.ocean;
  ctx.fillRect(world.port.x, world.port.y + world.port.h - 40, world.port.w, 40);
  for (const c of world.containers) {
    ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(c.x, c.y, c.w, c.h);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
  ctx.fillText('PORT OF SOLMAR', world.port.x + 10, world.port.y + 22);

  // Roads
  ctx.fillStyle = CFG.COLORS.road;
  for (const rx of world.roadsX) ctx.fillRect(rx - CFG.ROAD_W / 2, 0, CFG.ROAD_W, world.h);
  for (const ry of world.roadsY) ctx.fillRect(0, ry - CFG.ROAD_W / 2, world.w, CFG.ROAD_W);
  // Sidewalks
  ctx.fillStyle = CFG.COLORS.sidewalk;
  for (const rx of world.roadsX) {
    ctx.fillRect(rx - CFG.ROAD_W / 2 - 16, 0, 16, world.h);
    ctx.fillRect(rx + CFG.ROAD_W / 2, 0, 16, world.h);
  }
  for (const ry of world.roadsY) {
    ctx.fillRect(0, ry - CFG.ROAD_W / 2 - 16, world.w, 16);
    ctx.fillRect(0, ry + CFG.ROAD_W / 2, world.w, 16);
  }
  // Centre dashes
  ctx.strokeStyle = CFG.COLORS.roadLine; ctx.lineWidth = 3; ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const rx of world.roadsX) { ctx.moveTo(rx, 0); ctx.lineTo(rx, world.h); }
  for (const ry of world.roadsY) { ctx.moveTo(0, ry); ctx.lineTo(world.w, ry); }
  ctx.stroke(); ctx.setLineDash([]);

  // Buildings with a simple drop shadow + roof detail
  for (const b of world.buildings) {
    if (b.x > x0 + vw || b.y > y0 + vh || b.x + b.w < x0 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(b.x + 8, b.y + 8, Math.min(26, b.w - 16), Math.min(18, b.h - 16));
  }

  // Key locations
  drawPlace(ctx, world.bank.x, world.bank.y, 'BANK', '#f1c40f');
  drawPlace(ctx, world.garage.x, world.garage.y, 'GARAGE', '#3498db');
  drawPlace(ctx, world.safehouse.x, world.safehouse.y, 'SAFEHOUSE', '#2ecc71');
  drawPlace(ctx, world.hideout.x, world.hideout.y, 'HIDEOUT', '#9b59b6');
  drawPlace(ctx, world.delia.x, world.delia.y, "DELIA'S", '#e67e22');

  // Skid marks
  ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 4;
  for (const s of G.skid) {
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(s.angle) * 14, s.y + Math.sin(s.angle) * 14); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Mission marker: pulsing beacon + ground ring
  const obj = G.currentObjective();
  if (obj.target) {
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(obj.target.x, obj.target.y, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,0,0.25)';
    ctx.beginPath(); ctx.arc(obj.target.x, obj.target.y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
    // beacon column
    ctx.fillStyle = 'rgba(255,230,0,0.18)';
    ctx.fillRect(obj.target.x - 3, obj.target.y - 130, 6, 130);
    ctx.fillStyle = '#ffe600'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('▼', obj.target.x, obj.target.y - 132);
  }

  // Entities
  for (const c of G.parked) drawCar(ctx, c, time);
  for (const c of G.traffic) drawCar(ctx, c, time);
  for (const c of G.police) drawCar(ctx, c, time);
  for (const p of G.peds) drawPed(ctx, p, time);
  for (const o of G.officers) {
    ctx.save(); ctx.translate(o.x, o.y);
    ctx.fillStyle = '#1f3a93'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3); ctx.restore();
  }
  if (G.player.inCar && G.player.car) drawCar(ctx, G.player.car, time);
  else drawPlayer(ctx, G.player, time);

  // Particles + floating texts
  for (const pt of G.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const ft of G.floatTexts) {
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.fillStyle = ft.color; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  // Sunset wash: warm vignette over everything
  const grad = ctx.createRadialGradient(cam.x, cam.y, vh * 0.35, cam.x, cam.y, vh * 0.95);
  grad.addColorStop(0, 'rgba(255,170,80,0)');
  grad.addColorStop(1, 'rgba(255,120,40,0.16)');
  ctx.fillStyle = grad;
  ctx.fillRect(x0, y0, vw, vh);
}

function drawPlace(ctx, x, y, label, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(label[0], x, y + 3);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif';
  ctx.fillText(label, x, y - 18);
}
