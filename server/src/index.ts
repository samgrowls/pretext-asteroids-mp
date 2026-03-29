import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import geckos from '@geckos.io/server'
import { 
  WORLD_SIZE, SHIP_SIZE, SHIP_COLLISION_RADIUS, ASTEROID_COLLISION_FACTOR, BULLET_LIFETIME,
  type ShipState, type AsteroidState, type BulletState, type InputState, DEFAULT_INPUT, type GameEvent 
} from '@asteroids/shared'

const PORT = process.env.PORT || 3333
const CLIENT_DIR = process.env.CLIENT_DIR || '../../client'

// --- Express + Geckos Setup ---
const app = express()
app.use(cors())
app.use(express.static(CLIENT_DIR))

const httpServer = createServer(app)
// @ts-ignore - Geckos.io accepts server as first argument
const io = geckos(httpServer, {
  cors: { origin: '*' },
})

// --- Game State ---
type Player = {
  id: string
  name: string
  ship: ShipState
  input: InputState
  inputSeq: number
  lastAckSeq: number
}

const players = new Map<string, Player>()
const asteroids: AsteroidState[] = []
const bullets: BulletState[] = []
let gameStateSeq = 0

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

function createAsteroid(): AsteroidState {
  const sizeRoll = Math.random()
  const size: 'large' | 'medium' | 'small' = 
    sizeRoll > 0.6 ? 'large' : sizeRoll > 0.3 ? 'medium' : 'small'
  
  const radius = size === 'large' ? 50 : size === 'medium' ? 30 : 18
  const vertexCount = size === 'large' ? 12 : size === 'medium' ? 9 : 7
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
  const speed = ASTEROID_SPEED * (size === 'large' ? 0.6 : size === 'medium' ? 0.9 : 1.2)
  
  return {
    id: `a-${Date.now()}-${Math.random()}`,
    x: Math.random() * WORLD_SIZE,
    y: Math.random() * WORLD_SIZE,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    size,
    vertices,
  }
}

const ASTEROID_SPEED = 2.5

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
    asteroids.some(a => Math.hypot(a.x - x, a.y - y) < 200)
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
    lastAckSeq: 0,
  }
}

function broadcast(event: any, excludeId?: string) {
  // @ts-ignore - Geckos.io type quirks
  io.emit('event', event, excludeId ? [excludeId] : undefined)
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
    })

    // Broadcast join event
    // @ts-ignore - Geckos.io type quirks
    broadcast({ type: 'player-joined', playerId, name: player.name })

    console.log(`  Joined as: ${player.name} at (${player.ship.x.toFixed(0)}, ${player.ship.y.toFixed(0)})`)
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
      broadcast({ type: 'player-left', playerId })
      console.log(`[-] Player disconnected: ${playerId}`)
    }
  })
})

// --- Game Loop ---
const SHIP_THRUST = 0.15
const SHIP_ROTATION_SPEED = 0.05
const SHIP_FRICTION = 0.995
const SHIP_MAX_SPEED = 12
const BULLET_SPEED = 18
const BULLET_FIRE_RATE = 8

const playerFireCooldowns = new Map<string, number>()

function updatePhysics() {
  // Update ships
  for (const player of players.values()) {
    const ship = player.ship
    const input = player.input
    
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
    const cooldown = playerFireCooldowns.get(player.id) || 0
    if (input.fire && cooldown <= 0) {
      const dir = angleToVector(ship.angle)
      bullets.push({
        id: `b-${Date.now()}-${Math.random()}`,
        ownerId: player.id,
        x: ship.x + dir.x * SHIP_SIZE,
        y: ship.y + dir.y * SHIP_SIZE,
        vx: ship.vx + dir.x * BULLET_SPEED,
        vy: ship.vy + dir.y * BULLET_SPEED,
      })
      playerFireCooldowns.set(player.id, BULLET_FIRE_RATE)
    }
    if (cooldown > 0) playerFireCooldowns.set(player.id, cooldown - 1)
    
    // Teleport (simple version - just reposition)
    if (input.teleport) {
      ship.x = Math.random() * WORLD_SIZE
      ship.y = Math.random() * WORLD_SIZE
      ship.vx = 0
      ship.vy = 0
      player.input.teleport = false // Reset
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
    
    // Remove if off screen (shouldn't happen with wrap, but safety)
    if (bullet.x < -100 || bullet.x > WORLD_SIZE + 100 || 
        bullet.y < -100 || bullet.y > WORLD_SIZE + 100) {
      bullets.splice(i, 1)
      continue
    }
    
    // Lifetime
    bullet.life = (bullet.life || 0) + 1
    if (bullet.life > BULLET_LIFETIME) {
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
    
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = asteroids[ai]!
      const dist = Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y)
      
      if (dist < asteroid.radius) {
        bullets.splice(bi, 1)
        
        // Split asteroid
        if (asteroid.size === 'large') {
          asteroids.splice(ai, 1)
          for (let i = 0; i < 2; i++) {
            const newAst = createAsteroid()
            newAst.size = 'medium'
            newAst.radius = 30
            newAst.x = asteroid.x
            newAst.y = asteroid.y
            asteroids.push(newAst)
          }
        } else if (asteroid.size === 'medium') {
          asteroids.splice(ai, 1)
          for (let i = 0; i < 2; i++) {
            const newAst = createAsteroid()
            newAst.size = 'small'
            newAst.radius = 18
            newAst.x = asteroid.x
            newAst.y = asteroid.y
            asteroids.push(newAst)
          }
        } else {
          asteroids.splice(ai, 1)
        }
        
        // Score for bullet owner
        const owner = players.get(bullet.ownerId)
        if (owner) {
          owner.ship.score += asteroid.size === 'large' ? 20 : asteroid.size === 'medium' ? 50 : 100
          broadcast({ 
            type: 'score-update', 
            playerId: owner.id, 
            score: owner.ship.score 
          })
        }
        
        break
      }
    }
  }
  
  // Collisions: Bullets vs Ships
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const bullet = bullets[bi]!
    const target = players.get(bullet.ownerId === bullet.ownerId 
      ? Array.from(players.keys()).find(id => id !== bullet.ownerId) || ''
      : bullet.ownerId)
    
    // Check all ships except owner
    for (const [id, player] of players.entries()) {
      if (id === bullet.ownerId) continue
      if (!player.ship.alive) continue
      
      const dist = Math.hypot(bullet.x - player.ship.x, bullet.y - player.ship.y)
      if (dist < SHIP_COLLISION_RADIUS) {
        bullets.splice(bi, 1)
        
        // Kill ship
        player.ship.alive = false
        player.ship.deaths++
        player.ship.x = Math.random() * WORLD_SIZE
        player.ship.y = Math.random() * WORLD_SIZE
        
        // Award kill
        const killer = players.get(bullet.ownerId)
        if (killer) {
          killer.ship.kills++
          killer.ship.score += 100
          broadcast({ 
            type: 'score-update', 
            playerId: killer.id, 
            score: killer.ship.score 
          })
        }
        
        // Broadcast death event
        broadcast({
          type: 'player-died',
          playerId: player.id,
          killerId: bullet.ownerId,
        })
        
        // Respawn after delay
        setTimeout(() => {
          player.ship.alive = true
          player.ship.x = Math.random() * WORLD_SIZE
          player.ship.y = Math.random() * WORLD_SIZE
          player.ship.vx = 0
          player.ship.vy = 0
        }, 3000)
        
        break
      }
    }
  }
}

function broadcastState() {
  gameStateSeq++
  
  const state = {
    seq: gameStateSeq,
    ships: Array.from(players.values()).map(p => p.ship),
    asteroids,
    bullets,
  }
  
  io.emit('state', state)
}

// Run at 60 ticks per second
const TICK_INTERVAL = 1000 / 60
setInterval(() => {
  updatePhysics()
  broadcastState()
}, TICK_INTERVAL)

// --- Start Server ---
httpServer.listen(PORT, () => {
  console.log(`🚀 Asteroids server running on port ${PORT}`)
  console.log(`   World size: ${WORLD_SIZE}x${WORLD_SIZE}`)
  console.log(`   Initial asteroids: ${asteroids.length}`)
})
