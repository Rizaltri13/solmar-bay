// ui.js — everything the player reads.
//
// Two halves: the DOM menus (title, pause, busted/wasted, dialogue box and
// the banner pill) handled by the UI class, and the canvas HUD — status
// panels, wanted stars, the district/day pill, objective line, speedo and
// the live minimap — painted by drawHUD() after the world each frame.

import { CFG } from './config.js';
import { dayPhaseAt } from './render.js';

export function formatPlayTime(totalSeconds) {
  const whole = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function pill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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
    this._dialogueT = 0;
    this._bannerT = 0;
  }

  showTitle(save) {
    this.titleEl.classList.remove('hidden');
    this.pauseEl.classList.add('hidden');
    this.endEl.classList.add('hidden');
    const continueBtn = this.doc.getElementById('continue-btn');
    if (continueBtn) continueBtn.style.display = save ? '' : 'none';
    const bestLine = this.doc.getElementById('best-line');
    if (bestLine && save) {
      const missionNo = Math.min(save.missionIdx + 1, 5);
      bestLine.textContent = `Continue: $${save.cash} · mission ${missionNo}/5 · best $${save.bestCash || save.cash}`;
    }
  }

  hideTitle() {
    this.titleEl.classList.add('hidden');
  }

  showPause(stats = null) {
    this.pauseEl.classList.remove('hidden');
    const panel = this.doc.getElementById('pause-stats');
    if (panel && stats) {
      const earned = Math.floor(stats.cashEarned).toLocaleString('en-US');
      panel.textContent =
        `Jobs done: ${stats.missionsCompleted} · Exports delivered: ${stats.exportsDone} · ` +
        `Cash earned: $${earned} · Time played: ${formatPlayTime(stats.timePlayed)}`;
    }
  }

  hidePause() {
    this.pauseEl.classList.add('hidden');
  }

  showEnd(kind, text) {
    this.endTitle.textContent = kind === 'busted' ? 'BUSTED!' : 'WASTED!';
    this.endText.textContent = text;
    this.endEl.classList.remove('hidden');
  }

  hideEnd() {
    this.endEl.classList.add('hidden');
  }

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
    this.objectivePrompt(text);
  }

  // The small pill near the bottom mirrors the most recent banner so the
  // current instruction stays readable after the banner itself fades.
  objectivePrompt(text) {
    const el = this.doc.getElementById('objective-prompt');
    if (el && text) el.textContent = text;
  }

  tick(dt) {
    if (this._dialogueT > 0) {
      this._dialogueT -= dt;
      if (this._dialogueT <= 0) this.dialogueEl.classList.add('hidden');
    }
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this.bannerEl.classList.add('hidden');
    }
  }
}

// ---- canvas HUD -----------------------------------------------------------------

function paintStatusPanel(ctx, G) {
  const player = G.player;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  pill(ctx, 12, 12, 250, 74, 8);
  ctx.fill();

  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`$${Math.floor(player.cash).toLocaleString('en-US')}`, 24, 40);

  // Ammo readout escalates: white normally, amber when low, red when out.
  if (player.ammo <= 0) ctx.fillStyle = '#e74c3c';
  else if (player.ammo <= 6) ctx.fillStyle = '#ffb347';
  else ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  const missionNo = Math.min(G.missions.idx + 1, 5);
  ctx.fillText(`AMMO ${player.ammo}  •  MISSION ${missionNo}/5`, 24, 62);

  ctx.fillStyle = '#333';
  ctx.fillRect(24, 70, 150, 8);
  ctx.fillStyle = player.hp > 40 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(24, 70, 150 * Math.max(0, player.hp / CFG.PLAYER_HP), 8);
}

const STAR_COUNT = 5;
const STAR_STEP_PX = 34;

function paintWantedPanel(ctx, G, canvasW) {
  const stars = G.wantedStars();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  pill(ctx, canvasW - 212, 12, 200, 40, 8);
  ctx.fill();
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < STAR_COUNT; i++) {
    ctx.fillStyle = i < stars ? '#ffd700' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', canvasW - 182 + i * STAR_STEP_PX, 42);
  }
  if (stars > 0) {
    ctx.fillStyle = G.searching ? '#ffd700' : '#ff5b4d';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(
      G.searching ? '◌ SEARCHING — stay hidden' : '● PURSUIT — they see you',
      canvasW - 112, 74,
    );
  }
}

function paintPlaceAndTimePill(ctx, G, canvasW) {
  // District and clock share one centred pill. (Two stacked pills used to
  // collide with the DOM banner that sits at top:52px.)
  const pos = G.playerPos();
  const district = G.world.districtAt ? G.world.districtAt(pos.x, pos.y) : null;
  const phase = dayPhaseAt(G.dayT ?? CFG.DAY_START);
  const label = district
    ? `${district.name} · ${phase.clock} ${phase.label}`
    : `${phase.clock} ${phase.label}`;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  pill(ctx, canvasW / 2 - 130, 12, 260, 26, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd9a0';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, canvasW / 2, 30);
}

function objectiveSubline(G) {
  if (G.missions.storyDone) {
    return 'Story complete — free roam: export cars at the port crane';
  }
  const objective = G.currentObjective();
  const pos = G.playerPos();
  const parts = [];
  if (objective.target) {
    const dist = Math.hypot(pos.x - objective.target.x, pos.y - objective.target.y);
    parts.push(`${Math.round(dist)}m`);
  }
  if (G.missions.timer > 0) parts.push(`⏱ ${Math.ceil(G.missions.timer)}s`);
  if (G.missions.packages > 0) parts.push(`📦 ${G.missions.packages} on board`);
  if (G.missions.holdT > 0) parts.push(`VAULT ${Math.round(G.missions.holdT * 10) / 10}s…`);
  if (G.exportCar) parts.push(objective.target ? '• green ▼ = export car' : 'Export car marked in green');
  if (G.player.inCar && G.player.car) parts.push(`• ${G.player.car.model.toUpperCase()}`);
  return parts.join('   ');
}

function paintObjectivePanel(ctx, G) {
  const objective = G.currentObjective();
  const bottom = ctx.canvas.height;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  pill(ctx, 12, bottom - 64, 430, 52, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe600';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(objective.text.slice(0, 64), 24, bottom - 42);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText(objectiveSubline(G), 24, bottom - 22);
}

function paintSpeedo(ctx, G) {
  const player = G.player;
  if (!player.inCar || !player.car) return;
  const canvasW = ctx.canvas.width;
  const bottom = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  pill(ctx, canvasW - 132, bottom - 64, 120, 52, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(Math.abs(player.car.speed) * 0.22)}`, canvasW - 72, bottom - 30);
  ctx.font = '11px sans-serif';
  ctx.fillText('km/h', canvasW - 72, bottom - 16);
}

export function drawHUD(ctx, G) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  paintStatusPanel(ctx, G);
  paintWantedPanel(ctx, G, ctx.canvas.width);
  paintPlaceAndTimePill(ctx, G, ctx.canvas.width);
  paintObjectivePanel(ctx, G);
  paintSpeedo(ctx, G);
  paintMinimap(ctx, G);
}

// ---- minimap -----------------------------------------------------------------------

const DISTRICT_TINTS = {
  downtown: 'rgba(255,179,71,0.20)',
  motelrow: 'rgba(255,107,157,0.16)',
  marina: 'rgba(74,163,255,0.16)',
  port: 'rgba(160,160,170,0.22)',
  beach: 'rgba(217,192,138,0.35)',
  palms: 'rgba(46,204,113,0.14)',
};

function paintMinimap(ctx, G) {
  const mapW = 190;
  const mapH = 142;
  const mapX = ctx.canvas.width - mapW - 12;
  const mapY = 88; // below the wanted panel and its phase label
  const scaleX = mapW / G.world.w;
  const scaleY = mapH / G.world.h;
  const toMapX = (wx) => mapX + wx * scaleX;
  const toMapY = (wy) => mapY + wy * scaleY;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  pill(ctx, mapX - 4, mapY - 4, mapW + 8, mapH + 8, 8);
  ctx.fill();

  ctx.fillStyle = '#2e6f8e';
  ctx.fillRect(toMapX(G.world.beachX), mapY, mapW - G.world.beachX * scaleX, mapH);
  ctx.fillStyle = '#5d7a4a';
  ctx.fillRect(mapX, mapY, G.world.beachX * scaleX, mapH);

  for (const district of G.world.districts || []) {
    ctx.fillStyle = DISTRICT_TINTS[district.id] || 'rgba(255,255,255,0.08)';
    ctx.fillRect(toMapX(district.x), toMapY(district.y), district.w * scaleX, district.h * scaleY);
  }

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  for (const rx of G.world.roadsX) {
    ctx.beginPath();
    ctx.moveTo(toMapX(rx), mapY);
    ctx.lineTo(toMapX(rx), mapY + mapH);
    ctx.stroke();
  }
  for (const ry of G.world.roadsY) {
    ctx.beginPath();
    ctx.moveTo(mapX, toMapY(ry));
    ctx.lineTo(mapX + mapW, toMapY(ry));
    ctx.stroke();
  }

  // Route: an L along the player's street, then along the target's street.
  const objective = G.currentObjective();
  const pos = G.playerPos();
  if (objective.target) {
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(toMapX(pos.x), toMapY(pos.y));
    ctx.lineTo(toMapX(objective.target.x), toMapY(pos.y));
    ctx.lineTo(toMapX(objective.target.x), toMapY(objective.target.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(toMapX(objective.target.x), toMapY(objective.target.y), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (G.exportCar) {
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(toMapX(G.exportCar.x) - 3, toMapY(G.exportCar.y) - 3, 6, 6);
    ctx.fillRect(toMapX(CFG.PORT_CRANE.x) - 3, toMapY(CFG.PORT_CRANE.y) - 3, 6, 6);
  }

  ctx.fillStyle = '#f1c40f';
  for (const block of G.roadblocks || []) {
    ctx.fillRect(toMapX(block.x) - 2, toMapY(block.y) - 2, 4, 4);
  }
  if (G.searching && G.lastSeen) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toMapX(G.lastSeen.x), toMapY(G.lastSeen.y), 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#4aa3ff';
  for (const unit of G.police) {
    ctx.fillRect(toMapX(unit.x) - 2, toMapY(unit.y) - 2, 4, 4);
  }

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(toMapX(pos.x), toMapY(pos.y), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(toMapX(pos.x), toMapY(pos.y), 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR BAY', mapX, mapY + mapH + 14);
}
