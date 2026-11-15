// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. Edge presses (a key's first down, a click's first down)
// are queued here so semi-auto weapons and single actions (plant, buy, throw) can
// read them once per frame without polling history.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  let pressed = new Set();
  const state = { keys, locked: false, firing: false, fireEdge: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) {
      if (!state.firing) state.fireEdge = true;
      state.firing = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Consume this frame's edge presses; call once per simulation step.
    takePressed() {
      const out = pressed;
      pressed = new Set();
      return out;
    },
    takeFireEdge() {
      const edge = state.fireEdge;
      state.fireEdge = false;
      return edge;
    },
  };
}
