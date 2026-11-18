// input.js — keyboard and mouse tracking for the main loop.
//
// One Input instance exists per page (created by main.js). It keeps two
// views of the keyboard: `keys` for "is it held right now" and `pressed`
// for "did it go down during this frame" — the loop clears the second set
// at the end of every frame via endFrame().

const PREVENT_DEFAULT_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false, scaleX: 1, scaleY: 1 };

    window.addEventListener('keydown', (event) => {
      if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    // If the window loses focus mid-hold we would otherwise keep driving
    // forever, so a blur wipes every transient input in one go.
    window.addEventListener('blur', () => this.resetTransientState());

    canvas.addEventListener('mousemove', (event) => this.#trackMouse(event));
    canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('mouseleave', () => {
      this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  // The canvas is CSS-stretched to the window but renders at a fixed
  // internal resolution, so client coordinates must be rescaled before
  // they can be treated as canvas coordinates.
  #trackMouse(event) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? this.canvas.height / rect.height : 1;
    this.mouse.x = (event.clientX - rect.left) * sx;
    this.mouse.y = (event.clientY - rect.top) * sy;
    this.mouse.scaleX = sx;
    this.mouse.scaleY = sy;
  }

  // Heading from a world-space point to the cursor. The point is first
  // projected to screen space (camera centred), then compared with the
  // already-rescaled mouse position.
  mouseAngleFrom(wx, wy, cam, canvas) {
    const screenX = wx - cam.x + canvas.width / 2;
    const screenY = wy - cam.y + canvas.height / 2;
    return Math.atan2(this.mouse.y - screenY, this.mouse.x - screenX);
  }

  resetTransientState() {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.down = false;
    this.mouse.clicked = false;
  }

  down(code) {
    return this.keys.has(code);
  }

  // True while ANY of the given codes is held (e.g. either Shift key).
  anyDown(codes) {
    return codes.some((code) => this.keys.has(code));
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasPressedAny(codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }

  // Movement intent as a unit-ish vector. Diagonals are normalised so
  // diagonal movement is not faster than straight movement. `handbrake`
  // rides along on the same object: on foot Space means punch, but main.js
  // only feeds this vector to the car physics while driving, so the two
  // meanings never collide.
  moveVec() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y, handbrake: this.down('Space') };
  }
}
