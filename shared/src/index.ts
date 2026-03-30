// --- World Constants ---
export const WORLD_SIZE = 4000
export const WORLD_HALF = WORLD_SIZE / 2

// --- Ship Constants ---
export const SHIP_SIZE = 24
export const SHIP_THRUST = 0.15
export const SHIP_ROTATION_SPEED = 0.05
export const SHIP_MAX_SPEED = 12
export const SHIP_FRICTION = 0.995
export const SHIP_COLLISION_RADIUS = 10

// --- Bullet Constants ---
export const BULLET_SPEED = 18
export const BULLET_LIFETIME = 90 // frames
export const BULLET_FIRE_RATE = 8 // frames
export const BULLET_COLLISION_RADIUS = 5

// --- Asteroid Constants ---
export const ASTEROID_SPEED = 2.5
export const ASTEROID_COLLISION_FACTOR = 0.85
export const INITIAL_ASTEROID_COUNT = 50

// --- Game Constants ---
export const TARGET_FPS = 60
export const TICK_RATE = 60 // updates per second
export const INTERPOLATION_DELAY = 100 // ms

// --- Network Constants ---
export const RECONCILE_THRESHOLD = 50 // pixels - when to correct position

// --- Types ---

export type Vector2 = { x: number; y: number }

export type ShipState = {
  id: string
  name: string
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  alive: boolean
  team?: 'red' | 'blue'
  score: number
  deaths: number
  kills: number
}

export type AsteroidState = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  size: 'large' | 'medium' | 'small'
  vertices: Vector2[]
  hp: number
  maxHp: number
}

export type BulletState = {
  id: string
  ownerId: string
  x: number
  y: number
  vx: number
  vy: number
  life?: number
}

export type LetterDrop = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  letter: string
  life: number
  collected: boolean
}

export type GameState = {
  mode: string
  ships: ShipState[]
  asteroids: AsteroidState[]
  bullets: BulletState[]
  letterDrops: LetterDrop[]
  timeRemaining: number
  round: number
}

// --- Network Messages ---

export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'input'; seq: number; thrust: boolean; left: boolean; right: boolean; fire: boolean; teleport: boolean }
  | { type: 'ping'; timestamp: number }

export type ServerMessage =
  | { type: 'welcome'; playerId: string; worldSize: number }
  | { type: 'state'; seq: number; ships: ShipState[]; asteroids: AsteroidState[]; bullets: BulletState[] }
  | { type: 'event'; event: GameEvent }
  | { type: 'pong'; timestamp: number }

export type GameEvent =
  | { type: 'player-joined'; playerId: string; name: string }
  | { type: 'player-left'; playerId: string }
  | { type: 'player-died'; playerId: string; killerId?: string }
  | { type: 'score-update'; playerId: string; score: number }
  | { type: 'round-end'; winners: string[] }

// --- Input ---

export type InputState = {
  thrust: boolean
  left: boolean
  right: boolean
  fire: boolean
  teleport: boolean
}

export const DEFAULT_INPUT: InputState = {
  thrust: false,
  left: false,
  right: false,
  fire: false,
  teleport: false,
}
