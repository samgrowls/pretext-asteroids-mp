import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import geckos from '@geckos.io/server'
import { 
  WORLD_SIZE, SHIP_SIZE, SHIP_COLLISION_RADIUS, ASTEROID_COLLISION_FACTOR, BULLET_LIFETIME,
  type ShipState, type AsteroidState, type BulletState, type InputState, DEFAULT_INPUT
} from '@asteroids/shared'

const PORT = process.env.PORT || 3000
const CLIENT_DIR = process.env.CLIENT_DIR || '../../client'

// --- Game Constants ---
const SHIP_THRUST = 0.15
const SHIP_ROTATION_SPEED = 0.05
const SHIP_FRICTION = 0.995
const SHIP_MAX_SPEED = 12
const BULLET_SPEED = 18
const BULLET_FIRE_RATE = 8
const ASTEROID_SPEED = 2.5
const RESPAWN_TIME = 3000 // ms
const GAME_DURATION = 180000 // 3 minutes in ms
const WINNING_SCORE = 500

// --- Game Types ---
type GameMode = 'ffa' | 'teams' | 'ctf' | 'king'
type Player = {
  id: string
  name: string
  ship: ShipState
  input: InputState
  inputSeq: number
  fireCooldown: number
  respawnTime?: number
}

type GameModeConfig = {
  mode: GameMode
  duration: number
  winningScore: number
  teams?: boolean
}

// --- Game State ---
const players = new Map<string, Player>()
const asteroids: AsteroidState[] = []
const bullets: BulletState[] = []
let gameStateSeq = 0

let gameMode: GameModeConfig = {
  mode: 'ffa',
  duration: GAME_DURATION,
  winningScore: WINNING_SCORE,
}
let gameStartTime = 0
let gameActive = false
let winners: string[] = []

// --- Physics Helpers ---
function wrapPosition(x: number, y: number): { x: number; y: number } {
  let nx = x
  let ny = y
  if (nx < 0) nx += WORLD_SIZE
  if (nx >= WORLD_SIZE) nx -= WORLD_SIZE
  if (ny < 0) ny += WORLD_SIZE
  if (ny >= WORLD_SIZE) ny -= WORLD_SIZE
  return { x: nx, y: ny }
}

function angleToVector(angle: number): { x: number; y: number } {
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// --- Asteroid Generation ---
function createAsteroid(x?: number, y?: number, size?: 'large' | 'medium' | 'small'): AsteroidState {
  const finalSize = size ?? (Math.random() > 0.6 ? 'large' : Math.random() > 0.3 ? 'medium' : 'small')
  const radius = finalSize === 'large' ? 50 : finalSize === 'medium' ? 30 : 18
  const vertexCount = finalSize === 'large' ? 12 : finalSize === 'medium' ? 9 : 7
  
  const vertices: { x: number; y: number }[] = []
  const angles: number[] = []
  for (let i = 0; i < vertexCount; i++) {
    const baseAngle = (i / vertexCount) * Math.PI * 2
    angles.push(baseAngle + (Math.random() - 0.5) * 0.3)
  }
  angles.sort((a, b) => a - b)
  
  for (let i = 0; i < vertexCount; i++) {
    const angle = angles[i]!
    const variance = 0.75 + Math.random() * 0.5
    vertices.push({
      x: Math.cos(angle) * radius * variance,
      y: Math.sin(angle) * radius * variance,
    })
  }
  
  const angle = Math.random() * Math.PI * 2
  const speed = ASTEROID_SPEED * (finalSize === 'large' ? 0.6 : finalSize === 'medium' ? 0.9 : 1.2)
  
  return {
    id: `a-${Date.now()}-${Math.random()}`,
    x: x ?? Math.random() * WORLD_SIZE,
    y: y ?? Math.random() * WORLD_SIZE,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    size: finalSize,
    vertices,
  }
}

// Initialize asteroids
for (let i = 0; i < 50; i++) {
  asteroids.push(createAsteroid())
}

// --- Player Management ---
function createPlayer(id: string, name: string): Player {
  // Find spawn point away from asteroids
  let x: number, y: number
  let attempts = 0
  do {
    x = Math.random() * WORLD_SIZE
    y = Math.random() * WORLD_SIZE
    attempts++
  } while (
    attempts < 10 &&
    asteroids.some(a => distance({ x, y }, a) < 200)
  )
  
  return {
    id,
    name,
    ship: {
      id,
      name,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      alive: true,
      score: 0,
      deaths: 0,
      kills: 0,
    },
    input: { ...DEFAULT_INPUT },
    inputSeq: 0,
    fireCooldown: 0,
  }
}

function findSafeSpawnPoint(): { x: number; y: number } {
  let x: number, y: number
  let attempts = 0
  do {
    x = Math.random() * WORLD_SIZE
    y = Math.random() * WORLD_SIZE
    attempts++
  } while (
    attempts < 20 &&
    (asteroids.some(a => distance({ x, y }, a) < 150) ||
     Array.from(players.values()).some(p => p.ship.alive && distance({ x, y }, p.ship) < 300))
  )
  return { x, y }
}

// --- Express + Geckos Setup ---
const app = express()
app.use(cors())
app.use(express.static(CLIENT_DIR))

const httpServer = createServer(app)
// @ts-ignore - Geckos.io type quirks
const io = geckos(httpServer, {
  cors: { origin: '*' },
})

// --- Broadcasting ---
function broadcast(event: any, excludeId?: string) {
  // @ts-ignore - Geckos.io type quirks
  io.emit('event', event, excludeId ? [excludeId] : undefined)
}

function startGame() {
  gameActive = true
  gameStartTime = Date.now()
  winners = []
  
  // Reset all scores
  for (const player of players.values()) {
    player.ship.score = 0
    player.ship.kills = 0
    player.ship.deaths = 0
  }
  
  broadcast({ type: 'game-start', duration: gameMode.duration })
}

function endGame() {
  gameActive = false
  
  // Determine winners
  const sortedPlayers = Array.from(players.values())
    .filter(p => p.ship.alive || p.ship.score > 0)
    .sort((a, b) => b.ship.score - a.ship.score)
  
  if (sortedPlayers.length > 0) {
    const topScore = sortedPlayers[0]!.ship.score
    winners = sortedPlayers
      .filter(p => p.ship.score === topScore)
      .map(p => p.id)
  }
  
  broadcast({ 
    type: 'game-end', 
    winners,
    leaderboard: sortedPlayers.map(p => ({
      id: p.id,
      name: p.name,
      score: p.ship.score,
      kills: p.ship.kills,
      deaths: p.ship.deaths,
    }))
  })
}

function checkGameEnd() {
  if (!gameActive) return
  
  const elapsed = Date.now() - gameStartTime
  
  // Time limit reached
  if (elapsed >= gameMode.duration) {
    endGame()
    return
  }
  
  // Score limit reached (FFA only)
  if (gameMode.mode === 'ffa') {
    for (const player of players.values()) {
      if (player.ship.score >= gameMode.winningScore) {
        winners = [player.id]
        endGame()
        return
      }
    }
  }
  
  // Only one player left
  const alivePlayers = Array.from(players.values()).filter(p => p.ship.alive)
  if (alivePlayers.length === 1 && players.size > 2) {
    winners = [alivePlayers[0]!.id]
    endGame()
  }
}

// --- Geckos Connection Handler ---
io.onConnection((channel) => {
  let playerId: string | null = null
  
  console.log(`[+] Player connected: ${channel.id}`)
  
  channel.on('join', (data: any) => {
    // @ts-ignore - Geckos.io channel.id type
    playerId = channel.id
    const player = createPlayer(playerId!, data.name)
    players.set(playerId!, player)
    
    // Send welcome
    channel.emit('welcome', {
      playerId,
      worldSize: WORLD_SIZE,
      gameMode: gameMode.mode,
    })
    
    // Broadcast join event
    // @ts-ignore - Geckos.io type quirks
    broadcast({ type: 'player-joined', playerId, name: player.name })
    
    console.log(`  Joined as: ${player.name} at (${player.ship.x.toFixed(0)}, ${player.ship.y.toFixed(0)})`)
    
    // Start game if not running and we have players
    if (!gameActive && players.size >= 1) {
      startGame()
    }
  })
  
  channel.on('input', (data: any) => {
    if (!playerId) return
    const player = players.get(playerId)
    if (!player) return
    
    player.input = {
      thrust: data.thrust,
      left: data.left,
      right: data.right,
      fire: data.fire,
      teleport: data.teleport,
    }
    player.inputSeq = data.seq
  })
  
  channel.on('ping', (data: any) => {
    channel.emit('pong', { timestamp: Date.now() })
  })
  
  channel.onDisconnect(() => {
    if (playerId) {
      players.delete(playerId)
      // @ts-ignore - Geckos.io type quirks
      broadcast({ type: 'player-left', playerId })
      console.log(`[-] Player disconnected: ${playerId}`)
      
      // End game if no players left
      if (players.size === 0) {
        gameActive = false
      }
    }
  })
})

// --- Physics Update ---
function updatePhysics() {
  const now = Date.now()
  
  // Update ships
  for (const player of players.values()) {
    const ship = player.ship
    const input = player.input
    
    // Handle respawn
    if (!ship.alive && player.respawnTime && now >= player.respawnTime) {
      const spawn = findSafeSpawnPoint()
      ship.x = spawn.x
      ship.y = spawn.y
      ship.vx = 0
      ship.vy = 0
      ship.alive = true
      player.respawnTime = undefined
      continue
    }
    
    if (!ship.alive) continue
    
    // Rotation
    if (input.left) ship.angle -= SHIP_ROTATION_SPEED
    if (input.right) ship.angle += SHIP_ROTATION_SPEED
    
    // Thrust
    if (input.thrust) {
      const thrustVec = angleToVector(ship.angle)
      ship.vx += thrustVec.x * SHIP_THRUST
      ship.vy += thrustVec.y * SHIP_THRUST
    }
    
    // Friction
    ship.vx *= SHIP_FRICTION
    ship.vy *= SHIP_FRICTION
    
    // Speed limit
    const speed = Math.hypot(ship.vx, ship.vy)
    if (speed > SHIP_MAX_SPEED) {
      ship.vx = (ship.vx / speed) * SHIP_MAX_SPEED
      ship.vy = (ship.vy / speed) * SHIP_MAX_SPEED
    }
    
    // Position
    ship.x += ship.vx
    ship.y += ship.vy
    const wrapped = wrapPosition(ship.x, ship.y)
    ship.x = wrapped.x
    ship.y = wrapped.y
    
    // Fire
    if (player.fireCooldown > 0) player.fireCooldown--
    if (input.fire && player.fireCooldown <= 0) {
      const dir = angleToVector(ship.angle)
      bullets.push({
        id: `b-${Date.now()}-${Math.random()}`,
        ownerId: player.id,
        x: ship.x + dir.x * SHIP_SIZE,
        y: ship.y + dir.y * SHIP_SIZE,
        vx: ship.vx + dir.x * BULLET_SPEED,
        vy: ship.vy + dir.y * BULLET_SPEED,
        life: 0,
      })
      player.fireCooldown = BULLET_FIRE_RATE
    }
    
    // Teleport (emergency dodge - costs points)
    if (input.teleport) {
      const spawn = findSafeSpawnPoint()
      ship.x = spawn.x
      ship.y = spawn.y
      ship.vx = 0
      ship.vy = 0
      ship.score = Math.max(0, ship.score - 50) // Penalty
      input.teleport = false
    }
  }
  
  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i]!
    bullet.x += bullet.vx
    bullet.y += bullet.vy
    const wrapped = wrapPosition(bullet.x, bullet.y)
    bullet.x = wrapped.x
    bullet.y = wrapped.y
    
    // Lifetime
    bullet.life = (bullet.life ?? 0) + 1
    if (bullet.life! > BULLET_LIFETIME) {
      bullets.splice(i, 1)
    }
  }
  
  // Update asteroids
  for (const asteroid of asteroids) {
    asteroid.x += asteroid.vx
    asteroid.y += asteroid.vy
    const wrapped = wrapPosition(asteroid.x, asteroid.y)
    asteroid.x = wrapped.x
    asteroid.y = wrapped.y
  }
  
  // Collisions: Bullets vs Asteroids
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const bullet = bullets[bi]!
    let bulletHit = false
    
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = asteroids[ai]!
      if (distance(bullet, asteroid) < asteroid.radius) {
        bulletHit = true
        
        // Split asteroid
        if (asteroid.size === 'large') {
          asteroids.splice(ai, 1)
          for (let j = 0; j < 2; j++) {
            const newAst = createAsteroid(asteroid.x, asteroid.y, 'medium')
            const spreadAngle = (j / 2) * Math.PI + Math.random() * 0.5
            const spreadSpeed = 2
            newAst.vx += Math.cos(spreadAngle) * spreadSpeed
            newAst.vy += Math.sin(spreadAngle) * spreadSpeed
            asteroids.push(newAst)
          }
        } else if (asteroid.size === 'medium') {
          asteroids.splice(ai, 1)
          for (let j = 0; j < 2; j++) {
            const newAst = createAsteroid(asteroid.x, asteroid.y, 'small')
            const spreadAngle = (j / 2) * Math.PI + Math.random() * 0.5
            const spreadSpeed = 3
            newAst.vx += Math.cos(spreadAngle) * spreadSpeed
            newAst.vy += Math.sin(spreadAngle) * spreadSpeed
            asteroids.push(newAst)
          }
        } else {
          asteroids.splice(ai, 1)
        }
        
        // Score for bullet owner
        const owner = players.get(bullet.ownerId)
        if (owner) {
          owner.ship.score += asteroid.size === 'large' ? 20 : asteroid.size === 'medium' ? 50 : 100
        }
        
        break
      }
    }
    
    if (bulletHit) {
      bullets.splice(bi, 1)
    }
  }
  
  // Collisions: Bullets vs Ships
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const bullet = bullets[bi]!
    
    for (const [id, player] of players.entries()) {
      if (id === bullet.ownerId) continue
      if (!player.ship.alive) continue
      
      if (distance(bullet, player.ship) < SHIP_COLLISION_RADIUS) {
        bullets.splice(bi, 1)
        
        // Kill ship
        player.ship.alive = false
        player.ship.deaths++
        player.respawnTime = now + RESPAWN_TIME
        
        // Award kill
        const killer = players.get(bullet.ownerId)
        if (killer) {
          killer.ship.kills++
          killer.ship.score += 100
        }
        
        // Broadcast death event
        // @ts-ignore - Geckos.io type quirks
        broadcast({
          type: 'player-died',
          playerId: player.id,
          killerId: bullet.ownerId,
        })
        
        break
      }
    }
  }
  
  // Collisions: Ships vs Asteroids
  for (const player of players.values()) {
    const ship = player.ship
    if (!ship.alive) continue
    
    for (const asteroid of asteroids) {
      if (distance(ship, asteroid) < asteroid.radius * ASTEROID_COLLISION_FACTOR + SHIP_COLLISION_RADIUS) {
        // Kill ship
        ship.alive = false
        ship.deaths++
        player.respawnTime = now + RESPAWN_TIME
        
        // Broadcast death event
        // @ts-ignore - Geckos.io type quirks
        broadcast({
          type: 'player-died',
          playerId: player.id,
        })
        break
      }
    }
  }
  
  // Asteroid vs Asteroid collisions
  for (let i = 0; i < asteroids.length; i++) {
    for (let j = i + 1; j < asteroids.length; j++) {
      const a1 = asteroids[i]!
      const a2 = asteroids[j]!
      const dist = distance(a1, a2)
      const minDist = a1.radius + a2.radius
      
      if (dist < minDist && dist > 0) {
        // Normalize collision vector
        const nx = (a2.x - a1.x) / dist
        const ny = (a2.y - a1.y) / dist
        
        // Relative velocity
        const dvx = a1.vx - a2.vx
        const dvy = a1.vy - a2.vy
        const dvn = dvx * nx + dvy * ny
        
        // Only resolve if approaching
        if (dvn > 0) {
          const m1 = a1.radius * a1.radius
          const m2 = a2.radius * a2.radius
          const totalMass = m1 + m2
          const impulse = (2 * dvn) / totalMass
          
          a1.vx -= impulse * m2 * nx
          a1.vy -= impulse * m2 * ny
          a2.vx += impulse * m1 * nx
          a2.vy += impulse * m1 * ny
          
          // Separate
          const overlap = minDist - dist
          a1.x -= nx * overlap * 0.5
          a1.y -= ny * overlap * 0.5
          a2.x += nx * overlap * 0.5
          a2.y += ny * overlap * 0.5
        }
      }
    }
  }
  
  // Replenish asteroids
  while (asteroids.length < 30) {
    asteroids.push(createAsteroid())
  }
}

function broadcastState() {
  gameStateSeq++
  
  const state = {
    seq: gameStateSeq,
    ships: Array.from(players.values()).map(p => p.ship),
    asteroids,
    bullets,
    gameActive,
    timeRemaining: gameActive ? Math.max(0, gameMode.duration - (Date.now() - gameStartTime)) : 0,
  }
  
  io.emit('state', state)
}

// Run at 60 ticks per second
const TICK_INTERVAL = 1000 / 60
setInterval(() => {
  updatePhysics()
  broadcastState()
  checkGameEnd()
}, TICK_INTERVAL)

// --- Start Server ---
httpServer.listen(PORT, () => {
  console.log(`🚀 Asteroids MP server running on port ${PORT}`)
  console.log(`   World size: ${WORLD_SIZE}x${WORLD_SIZE}`)
  console.log(`   Initial asteroids: ${asteroids.length}`)
  console.log(`   Game mode: ${gameMode.mode}`)
  console.log(`   Access at: http://localhost:${PORT}`)
})
