// SOLMAR BAY — every tunable constant in one place.
export const CFG = {
  WORLD_W: 2560,
  WORLD_H: 1920,
  ROAD_SPACING: 320,
  ROAD_W: 68,
  TILE: 320,

  // Player on foot
  WALK_SPEED: 190,
  RUN_SPEED: 260,
  PLAYER_R: 13,
  PLAYER_HP: 100,

  // Driving
  CAR_ACCEL: 420,
  CAR_REVERSE: 260,
  CAR_MAX_SPEED: 560,
  CAR_MAX_REVERSE: 180,
  CAR_TURN: 2.6,
  CAR_GRIP: 3.2,
  CAR_R: 16,

  // Combat
  PISTOL_DAMAGE: 34,
  PISTOL_RANGE: 430,
  PISTOL_RATE: 0.22,
  PUNCH_DAMAGE: 18,
  PUNCH_RANGE: 42,
  PUNCH_RATE: 0.45,
  START_AMMO: 24,

  // Wanted
  HEAT_PER_STAR: 25,
  MAX_HEAT: 125,
  DECAY_RATE: 6, // heat per second while hidden
  DECAY_DELAY: 4, // seconds after last seen before decay starts

  // Economy / rewards
  MISSION_REWARDS: [500, 800, 1000, 1500, 5000],

  COLORS: {
    grass: '#5d7a4a',
    grass2: '#54704a',
    sand: '#d9c08a',
    ocean: '#2e6f8e',
    oceanDeep: '#1f5578',
    road: '#3a3a40',
    roadLine: '#c9a227',
    sidewalk: '#8a8578',
    buildingRoof: ['#7a5a4a', '#5a6a7a', '#8a6a4a', '#6a5a7a', '#4a6a5a', '#9a7a5a'],
    car: ['#c0392b', '#2980b9', '#f1c40f', '#8e44ad', '#16a085', '#e67e22', '#ecf0f1', '#2c3e50', '#d35400'],
    police: '#1f3a93',
    player: '#e74c3c',
  },

  // Key places (world coords) — all on road intersections so they are drivable.
  SPAWN: { x: 320, y: 320 },
  SAFEHOUSE: { x: 320, y: 320 },
  BANK: { x: 1920, y: 320 },
  GARAGE: { x: 640, y: 1280 },
  HIDEOUT: { x: 1920, y: 1600 },
  DELIA: { x: 1280, y: 960 },
  PORT: { x: 320, y: 1600, w: 640, h: 320 },
  BEACH_X: 2240, // east of this is sand + ocean
};
