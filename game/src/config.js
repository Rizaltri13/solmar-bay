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

  // Day cycle (v3): game time drifts through a slow coastal day. dayT is
  // normalised 0..1 (0 = dawn). The tint is a pure function of dayT so
  // staged screenshots can pin an exact, reproducible light.
  DAY_CYCLE_SECONDS: 300, // one full Solmar day: five unhurried minutes
  DAY_START: 0.62, // sessions open in late-afternoon gold
  DAY_PHASES: [
    { at: 0.0, label: 'DAWN', tint: 'rgba(255,166,88,0.14)' },
    { at: 0.22, label: 'MORNING', tint: 'rgba(255,214,140,0.05)' },
    { at: 0.45, label: 'MIDDAY', tint: 'rgba(255,255,255,0)' },
    { at: 0.62, label: 'GOLDEN HOUR', tint: 'rgba(255,170,80,0.13)' },
    { at: 0.78, label: 'DUSK', tint: 'rgba(122,62,148,0.20)' },
    { at: 0.9, label: 'NIGHTFALL', tint: 'rgba(18,28,72,0.26)' },
  ],
  TRAFFIC_HONK_AFTER: 1.1, // seconds blocked before a driver honks (entities)
  TRAFFIC_HONK_COOLDOWN: 2.8,

  // Wanted — pursuit is line-of-sight based, with a SEARCH phase
  HEAT_PER_STAR: 25,
  MAX_HEAT: 125,
  DECAY_RATE: 6, // heat per second while hidden
  SEARCH_DECAY_RATE: 14, // heat decays much faster while police are searching unseen
  DECAY_DELAY: 4, // seconds after last seen before decay starts
  SIGHT_RANGE: 380, // police / officers only truly "see" Mara inside this
  SEARCH_ENTER_TIME: 0.6, // seconds unseen before the SEARCH phase starts
  ROADBLOCK_STARS: 4, // roadblocks join the chase at this wanted level

  // Vehicle classes — every class drives differently (see entities.driveCar)
  VEHICLE_CLASSES: {
    sedan: { accelMul: 1.0, maxMul: 1.0, turnMul: 1.0, gripMul: 1.0, label: 'Sedan' },
    coupe: { accelMul: 1.3, maxMul: 1.18, turnMul: 1.15, gripMul: 0.9, label: 'Coupe' },
    truck: { accelMul: 0.62, maxMul: 0.72, turnMul: 0.72, gripMul: 1.2, label: 'Truck' },
    van: { accelMul: 0.78, maxMul: 0.85, turnMul: 0.85, gripMul: 1.1, label: 'Van' },
  },

  // Free-roam economy: vehicle export at the port + safehouse services
  EXPORT_REWARD: 400,
  EXPORT_MARKER_COLOR: '#2ecc71',
  PORT_CRANE: { x: 430, y: 1700, radius: 85 },
  SAFEHOUSE_SERVICE_COST: 150,
  SAFEHOUSE_SERVICE_RADIUS: 95,

  // Recognizable coastal districts (world dressing + minimap tint + names)
  DISTRICTS: [
    { id: 'downtown', name: 'DOWNTOWN', x: 900, y: 250, w: 1000, h: 800 },
    { id: 'motelrow', name: 'MOTEL ROW', x: 250, y: 850, w: 700, h: 450 },
    { id: 'marina', name: 'MARINA', x: 1500, y: 850, w: 700, h: 450 },
    { id: 'port', name: 'PORT OF SOLMAR', x: 250, y: 1500, w: 750, h: 380 },
    { id: 'beach', name: 'SOLMAR BEACH', x: 2180, y: 100, w: 360, h: 1700 },
    { id: 'palms', name: 'PALM HEIGHTS', x: 950, y: 1250, w: 900, h: 550 },
  ],
  SIGN_TEXTS: ['CAFE SOL', 'HOTEL MAR', 'TACOS', 'SURF SHOP', 'BAR LUNA', 'PAWN', 'DINER 9', 'BAKERY', 'MOTEL SOLMAR', 'PALM MOTEL', 'LIQUOR', 'GYM'],

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
