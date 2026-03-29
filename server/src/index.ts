import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
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
  mode: 'ffa' | 'teams' | 'ctf' | 'king'
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
  const baseRadius = finalSize === 'large' ? 50 : finalSize === 'medium' ? 30 : 18
  
  // More varied vertex count for irregular shapes
  const vertexCount = finalSize === 'large' 
    ? 8 + Math.floor(Math.random() * 6)  // 8-13 vertices
    : finalSize === 'medium' 
      ? 6 + Math.floor(Math.random() * 5)  // 6-10 vertices
      : 5 + Math.floor(Math.random() * 4)  // 5-8 vertices

  const vertices: { x: number; y: number }[] = []
  const angles: number[] = []
  
  // Create irregular angle distribution (not evenly spaced)
  let currentAngle = Math.random() * Math.PI * 2
  for (let i = 0; i < vertexCount; i++) {
    angles.push(currentAngle)
    // Vary the angle gap significantly (0.3 to 1.0 radians)
    currentAngle += 0.3 + Math.random() * 0.7
  }
  
  // Add some extra vertices for really irregular shapes
  if (Math.random() > 0.5) {
    const extraAngle = Math.random() * Math.PI * 2
    angles.push(extraAngle)
    angles.sort((a, b) => a - b)
  }

  // Create vertices with extreme radius variation
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i]!
    // More extreme variance: 0.5 to 1.4 (creates protrusions and indentations)
    const variance = 0.5 + Math.random() * 0.9
    // Add some flat sides by clustering some vertices
    const flatModifier = Math.random() > 0.8 ? 0.85 : 1.0
    vertices.push({
      x: Math.cos(angle) * baseRadius * variance * flatModifier,
      y: Math.sin(angle) * baseRadius * variance * flatModifier,
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
    radius: baseRadius,
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

// --- Express + Socket.io Setup ---
const app = express()
app.use(cors())
app.use(express.static(CLIENT_DIR))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

// --- Broadcasting ---
function broadcast(event: any, excludeId?: string) {
  if (excludeId) {
    io.emit('event', event)
  } else {
    io.emit('event', event)
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

function startGame() {
  gameActive = true
  gameStartTime = Date.now()
  winners = []
  console.log('[GAME STARTED] Players:', players.size)

  for (const player of players.values()) {
    player.ship.score = 0
    player.ship.kills = 0
    player.ship.deaths = 0
  }

  broadcast({ type: 'game-start', duration: gameMode.duration })
}

function endGame() {
  gameActive = false
  
  const sortedPlayers = Array.from(players.values())
    .filter(p => p.ship.alive || p.ship.score > 0)
    .sort((a, b) => b.ship.score - a.ship.score)
  
  if (sortedPlayers.length > 0) {
    const topScore = sortedPlayers[0]!.ship.score
    winners = sortedPlayers.filter(p => p.ship.score === topScore).map(p => p.id)
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
  
  if (elapsed >= gameMode.duration) {
    endGame()
    return
  }
  
  if (gameMode.mode === 'ffa') {
    for (const player of players.values()) {
      if (player.ship.score >= gameMode.winningScore) {
        winners = [player.id]
        endGame()
        return
      }
    }
  }
  
  const alivePlayers = Array.from(players.values()).filter(p => p.ship.alive)
  if (alivePlayers.length === 1 && players.size > 2) {
    winners = [alivePlayers[0]!.id]
    endGame()
  }
}

// --- Socket.io Connection Handler ---
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`)
  
  socket.on('join', (data: { name: string }) => {
    const player = createPlayer(socket.id, data.name)
    players.set(socket.id, player)
    
    socket.emit('welcome', {
      playerId: socket.id,
      worldSize: WORLD_SIZE,
      gameMode: gameMode.mode,
    })
    
    broadcast({ type: 'player-joined', playerId: socket.id, name: player.name })
    
    console.log(`  Joined as: ${player.name} at (${player.ship.x.toFixed(0)}, ${player.ship.y.toFixed(0)})`)
    console.log(`  Total players: ${players.size}, gameActive: ${gameActive}`)
    
    if (!gameActive && players.size >= 1) {
      console.log('[AUTO-START] Starting game with', players.size, 'players')
      startGame()
    }
  })
  
  socket.on('input', (data: { seq: number; thrust: boolean; left: boolean; right: boolean; fire: boolean; teleport: boolean }) => {
    const player = players.get(socket.id)
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
  
  socket.on('ping', (data: { timestamp: number }) => {
    socket.emit('pong', { timestamp: Date.now() })
  })
  
  socket.on('disconnect', () => {
    players.delete(socket.id)
    broadcast({ type: 'player-left', playerId: socket.id })
    console.log(`[-] Player disconnected: ${socket.id}`)
    
    if (players.size === 0) {
      gameActive = false
    }
  })
})

// --- Physics Update ---
function updatePhysics() {
  const now = Date.now()
  
  for (const player of players.values()) {
    const ship = player.ship
    const input = player.input
    
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
    
    if (input.left) ship.angle -= SHIP_ROTATION_SPEED
    if (input.right) ship.angle += SHIP_ROTATION_SPEED
    
    if (input.thrust) {
      const thrustVec = angleToVector(ship.angle)
      ship.vx += thrustVec.x * SHIP_THRUST
      ship.vy += thrustVec.y * SHIP_THRUST
    }
    
    ship.vx *= SHIP_FRICTION
    ship.vy *= SHIP_FRICTION
    
    const speed = Math.hypot(ship.vx, ship.vy)
    if (speed > SHIP_MAX_SPEED) {
      ship.vx = (ship.vx / speed) * SHIP_MAX_SPEED
      ship.vy = (ship.vy / speed) * SHIP_MAX_SPEED
    }
    
    ship.x += ship.vx
    ship.y += ship.vy
    const wrapped = wrapPosition(ship.x, ship.y)
    ship.x = wrapped.x
    ship.y = wrapped.y
    
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
    
    if (input.teleport) {
      const spawn = findSafeSpawnPoint()
      ship.x = spawn.x
      ship.y = spawn.y
      ship.vx = 0
      ship.vy = 0
      ship.score = Math.max(0, ship.score - 50)
      input.teleport = false
    }
  }
  
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i]!
    bullet.x += bullet.vx
    bullet.y += bullet.vy
    const wrapped = wrapPosition(bullet.x, bullet.y)
    bullet.x = wrapped.x
    bullet.y = wrapped.y
    
    bullet.life = (bullet.life ?? 0) + 1
    if (bullet.life! > BULLET_LIFETIME) {
      bullets.splice(i, 1)
    }
  }
  
  for (const asteroid of asteroids) {
    asteroid.x += asteroid.vx
    asteroid.y += asteroid.vy
    const wrapped = wrapPosition(asteroid.x, asteroid.y)
    asteroid.x = wrapped.x
    asteroid.y = wrapped.y
  }
  
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const bullet = bullets[bi]!
    let bulletHit = false
    
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = asteroids[ai]!
      if (distance(bullet, asteroid) < asteroid.radius) {
        bulletHit = true
        
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
        
        const owner = players.get(bullet.ownerId)
        if (owner) {
          owner.ship.score += asteroid.size === 'large' ? 20 : asteroid.size === 'medium' ? 50 : 100
        }
        
        break
      }
    }
    
    if (bulletHit) bullets.splice(bi, 1)
  }
  
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const bullet = bullets[bi]!
    
    for (const [id, player] of players.entries()) {
      if (id === bullet.ownerId) continue
      if (!player.ship.alive) continue
      
      if (distance(bullet, player.ship) < SHIP_COLLISION_RADIUS) {
        bullets.splice(bi, 1)
        
        player.ship.alive = false
        player.ship.deaths++
        player.respawnTime = now + RESPAWN_TIME
        
        const killer = players.get(bullet.ownerId)
        if (killer) {
          killer.ship.kills++
          killer.ship.score += 100
        }
        
        broadcast({
          type: 'player-died',
          playerId: player.id,
          killerId: bullet.ownerId,
        })
        
        break
      }
    }
  }
  
  for (const player of players.values()) {
    const ship = player.ship
    if (!ship.alive) continue
    
    for (const asteroid of asteroids) {
      if (distance(ship, asteroid) < asteroid.radius * ASTEROID_COLLISION_FACTOR + SHIP_COLLISION_RADIUS) {
        ship.alive = false
        ship.deaths++
        player.respawnTime = now + RESPAWN_TIME
        
        broadcast({
          type: 'player-died',
          playerId: player.id,
        })
        break
      }
    }
  }
  
  for (let i = 0; i < asteroids.length; i++) {
    for (let j = i + 1; j < asteroids.length; j++) {
      const a1 = asteroids[i]!
      const a2 = asteroids[j]!
      const dist = distance(a1, a2)
      const minDist = a1.radius + a2.radius
      
      if (dist < minDist && dist > 0) {
        const nx = (a2.x - a1.x) / dist
        const ny = (a2.y - a1.y) / dist
        
        const dvx = a1.vx - a2.vx
        const dvy = a1.vy - a2.vy
        const dvn = dvx * nx + dvy * ny
        
        if (dvn > 0) {
          const m1 = a1.radius * a1.radius
          const m2 = a2.radius * a2.radius
          const totalMass = m1 + m2
          const impulse = (2 * dvn) / totalMass
          
          a1.vx -= impulse * m2 * nx
          a1.vy -= impulse * m2 * ny
          a2.vx += impulse * m1 * nx
          a2.vy += impulse * m1 * ny
          
          const overlap = minDist - dist
          a1.x -= nx * overlap * 0.5
          a1.y -= ny * overlap * 0.5
          a2.x += nx * overlap * 0.5
          a2.y += ny * overlap * 0.5
        }
      }
    }
  }
  
  while (asteroids.length < 30) {
    asteroids.push(createAsteroid())
  }
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
