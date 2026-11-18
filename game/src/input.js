// Keyboard + mouse state for the loop. One instance, owned by main.js.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared each frame by main
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Losing focus must not leave a stuck key (or a stuck trigger) behind:
    // clear held keys, edge presses and the mouse button together.
    window.addEventListener('blur', () => this.resetTransientState());
    canvas.addEventListener('mouseleave', () => { this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => {
      // Scale CSS pixels → canvas pixels: the canvas is styled to the full
      // window but has a fixed internal resolution, so without this the aim
      // point drifts whenever the window is not exactly canvas-sized.
      const r = canvas.getBoundingClientRect();
      const scaleX = r.width ? canvas.width / r.width : 1;
      const scaleY = r.height ? canvas.height / r.height : 1;
      this.mouse.x = (e.clientX - r.left) * scaleX;
      this.mouse.y = (e.clientY - r.top) * scaleY;
      this.mouse.scaleX = scaleX; this.mouse.scaleY = scaleY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // Angle from a world point (drawn at cam centre) to the mouse, in world
  // space — mouse coords are already canvas-scaled by the move handler.
  mouseAngleFrom(wx, wy, cam, canvas) {
    const sx = wx - cam.x + canvas.width / 2;
    const sy = wy - cam.y + canvas.height / 2;
    return Math.atan2(this.mouse.y - sy, this.mouse.x - sx);
  }
  // Drop every transient input at once (window blur, pause, respawn).
  resetTransientState() {
    this.keys.clear(); this.pressed.clear();
    this.mouse.down = false; this.mouse.clicked = false;
  }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  // True when ANY of the given codes was edge-pressed this frame.
  wasPressedAny(codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); this.mouse.clicked = false; }
  // WASD / arrows as a -1..1 vector. Also carries the handbrake: the
  // title screen promises "Space = handbrake while driving" and
  // entities.driveCar reads mv.handbrake, but moveVec never set it —
  // so the handbrake silently did nothing for real keyboard players.
  // (On foot Space still punches; main only drives with this vector
  // while Mara is in a car, so the two uses never collide.)
  moveVec() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y, handbrake: this.down('Space') };
  }
}
