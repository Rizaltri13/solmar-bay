// HUD (drawn on the canvas), live minimap, and the DOM menus:
// title, pause, busted/wasted, dialogue, banner.
import { CFG } from './config.js';

export class UI {
  constructor(doc) {
    this.doc = doc;
    this.titleEl = doc.getElementById('title-screen');
    this.pauseEl = doc.getElementById('pause-screen');
    this.endEl = doc.getElementById('end-screen');
    this.endTitle = doc.getElementById('end-title');
    this.endText = doc.getElementById('end-text');
    this.dialogueEl = doc.getElementById('dialogue');
    this.dialogueWho = doc.getElementById('dialogue-who');
    this.dialogueText = doc.getElementById('dialogue-text');
    this.bannerEl = doc.getElementById('banner');
    this._dialogueT = 0; this._bannerT = 0;
  }
  showTitle(save) {
    this.titleEl.classList.remove('hidden');
    this.pauseEl.classList.add('hidden'); this.endEl.classList.add('hidden');
    const cont = this.doc.getElementById('continue-btn');
    if (cont) cont.style.display = save ? '' : 'none';
    const best = this.doc.getElementById('best-line');
    if (best && save) best.textContent = `Continue: $${save.cash} · mission ${Math.min(save.missionIdx + 1, 5)}/5 · best $${save.bestCash || save.cash}`;
  }
  hideTitle() { this.titleEl.classList.add('hidden'); }
  showPause() { this.pauseEl.classList.remove('hidden'); }
  hidePause() { this.pauseEl.classList.add('hidden'); }
  showEnd(kind, text) {
    this.endTitle.textContent = kind === 'busted' ? 'BUSTED!' : 'WASTED!';
    this.endText.textContent = text;
    this.endEl.classList.remove('hidden');
  }
  hideEnd() { this.endEl.classList.add('hidden'); }
  dialogue(text, who = 'DELIA ROOK') {
    this.dialogueWho.textContent = who;
    this.dialogueText.textContent = text;
    this.dialogueEl.classList.remove('hidden');
    this._dialogueT = 6;
  }
  banner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('hidden');
    this._bannerT = 3;
  }
  tick(dt) {
    if (this._dialogueT > 0) { this._dialogueT -= dt; if (this._dialogueT <= 0) this.dialogueEl.classList.add('hidden'); }
    if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) this.bannerEl.classList.add('hidden'); }
  }
}

// --- HUD + minimap, painted on the main canvas ---
export function drawHUD(ctx, G) {
  const W = ctx.canvas.width;
  const p = G.player;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // Top-left: cash + health + ammo
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 12, 12, 250, 74, 8); ctx.fill();
  ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`$${Math.floor(p.cash).toLocaleString('en-US')}`, 24, 40);
  ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
  ctx.fillText(`AMMO ${p.ammo}  •  MISSION ${Math.min(G.missions.idx + 1, 5)}/5`, 24, 62);
  // health bar
  ctx.fillStyle = '#333'; ctx.fillRect(24, 70, 150, 8);
  ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(24, 70, 150 * Math.max(0, p.hp / CFG.PLAYER_HP), 8);

  // Top-right: wanted stars
  const stars = G.wantedStars();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, W - 212, 12, 200, 40, 8); ctx.fill();
  ctx.font = '24px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd700' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', W - 182 + i * 34, 42);
  }

  // Bottom-left: objective + distance + timer
  const obj = G.currentObjective();
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 12, ctx.canvas.height - 64, 430, 52, 8); ctx.fill();
  ctx.fillStyle = '#ffe600'; ctx.font = 'bold 14px sans-serif';
  ctx.fillText(obj.text.slice(0, 64), 24, ctx.canvas.height - 42);
  const pos = G.playerPos();
  let sub = '';
  if (obj.target) sub = `${Math.round(Math.hypot(pos.x - obj.target.x, pos.y - obj.target.y))}m`;
  if (G.missions.timer > 0) sub += `   ⏱ ${Math.ceil(G.missions.timer)}s`;
  if (G.missions.storyDone) sub = 'Story complete — free roam';
  ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
  ctx.fillText(sub, 24, ctx.canvas.height - 22);

  // Bottom-right: speed when driving
  if (p.inCar && p.car) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, W - 132, ctx.canvas.height - 64, 120, 52, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.22)}`, W - 72, ctx.canvas.height - 30);
    ctx.font = '11px sans-serif';
    ctx.fillText('km/h', W - 72, ctx.canvas.height - 16);
  }

  drawMinimap(ctx, G);
}

function drawMinimap(ctx, G) {
  const mw = 190, mh = 142, mx = ctx.canvas.width - mw - 12, my = 64;
  const sx = mw / G.world.w, sy = mh / G.world.h;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, mx - 4, my - 4, mw + 8, mh + 8, 8); ctx.fill();
  // ocean + sand
  ctx.fillStyle = '#2e6f8e';
  ctx.fillRect(mx + G.world.beachX * sx, my, mw - G.world.beachX * sx, mh);
  ctx.fillStyle = '#5d7a4a';
  ctx.fillRect(mx, my, G.world.beachX * sx, mh);
  // roads
  ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
  for (const rx of G.world.roadsX) { ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke(); }
  for (const ry of G.world.roadsY) { ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke(); }
  // mission marker
  const obj = G.currentObjective();
  if (obj.target) {
    ctx.fillStyle = '#ffe600';
    ctx.beginPath(); ctx.arc(mx + obj.target.x * sx, my + obj.target.y * sy, 5, 0, Math.PI * 2); ctx.fill();
  }
  // police (blue) then player (red/white)
  ctx.fillStyle = '#4aa3ff';
  for (const c of G.police) { ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 4, 4); }
  const pos = G.playerPos();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(mx + pos.x * sx, my + pos.y * sy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath(); ctx.arc(mx + pos.x * sx, my + pos.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('SOLMAR BAY', mx, my + mh + 14);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
