import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import { 
  WORLD_SIZE, SHIP_SIZE, SHIP_COLLISION_RADIUS, ASTEROID_COLLISION_FACTOR, BULLET_LIFETIME,
  type ShipState, type AsteroidState, type BulletState, type InputState, DEFAULT_INPUT
} from '@asteroids/shared'
import { SATS_CATEGORIES, SATS_CHALLENGES, SCORING } from '@asteroids/shared/sats-words'

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
const BASE_POSITION = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 }  // Center of map
const BASE_RADIUS = 150

// Year 6 SATs common words (subset of most frequent)
const SATS_WORDS = [
  'achieve', 'address', 'answer', 'appear', 'arrive', 'believe', 'breath', 'bridge',
  'build', 'business', 'calendar', 'caught', 'centre', 'century', 'certain', 'circle',
  'complete', 'consider', 'continue', 'decide', 'describe', 'different', 'difficult',
  'discover', 'early', 'earth', 'eight', 'enough', 'exercise', 'experience', 'famous',
  'favourite', 'february', 'foreign', 'forty', 'forward', 'friend', 'grammar', 'group',
  'guard', 'guide', 'happen', 'height', 'history', 'hour', 'important', 'improve',
  'island', 'january', 'knowledge', 'learn', 'length', 'letter', 'light', 'march',
  'material', 'maybe', 'measure', 'minute', 'month', 'natural', 'naughty', 'necessary',
  'notice', 'november', 'number', 'occur', 'often', 'order', 'ought', 'people',
  'please', 'popular', 'position', 'possible', 'potato', 'power', 'pressure', 'probably',
  'promise', 'purpose', 'quarter', 'question', 'recent', 'regular', 'remember', 'special',
  'straight', 'street', 'strong', 'sudden', 'suppose', 'system', 'table', 'perhaps',
  'temperature', 'therefore', 'thirteen', 'thirty', 'thought', 'through', 'thursday',
  'tongue', 'tonight', 'tuesday', 'various', 'vegetable', 'vehicle', 'wednesday',
  'weight', 'winter', 'wonder', 'working', 'world', 'write', 'yellow', 'yesterday'
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// --- Game Types ---
type Player = {
  id: string
  name: string
  ship: ShipState
  input: InputState
  inputSeq: number
  fireCooldown: number
  respawnTime?: number
  // Challenge state
  depositedLetterCount: number  // Total letters deposited
  currentChallenge?: {
    category: string
    sentenceIndex: number
    startTime: number
    usedHints: number
  }
  challengeStreak: number  // Consecutive correct answers
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
const letterDrops: LetterDrop[] = []
const depositedLetters: { letter: string, x: number, y: number, life: number }[] = []  // Letters at base
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
function createAsteroid(x?: number, y?: number, size?: 'large' | 'medium' | 'small', hp?: number): AsteroidState {
  const finalSize = size ?? (Math.random() > 0.6 ? 'large' : Math.random() > 0.3 ? 'medium' : 'small')
  
  // Varied radius within each size category
  const baseRadius = finalSize === 'large' 
    ? 40 + Math.random() * 25    // 40-65 (was fixed 50)
    : finalSize === 'medium'
      ? 22 + Math.random() * 14  // 22-36 (was fixed 30)
      : 12 + Math.random() * 10  // 12-22 (was fixed 18)
  
  // Health based on size and radius (larger = more HP)
  const health = hp ?? (finalSize === 'large' 
    ? Math.floor(baseRadius / 10) + 2  // 6-8 HP for large
    : finalSize === 'medium'
      ? Math.floor(baseRadius / 10) + 1  // 3-4 HP for medium
      : 1)  // 1 HP for small

  // More varied vertex count for irregular shapes
  const vertexCount = finalSize === 'large' 
    ? 8 + Math.floor(Math.random() * 4)   // 8-11 vertices
    : finalSize === 'medium' 
      ? 7 + Math.floor(Math.random() * 3)  // 7-9 vertices
      : 6 + Math.floor(Math.random() * 2)  // 6-7 vertices

  const vertices: { x: number; y: number }[] = []
  const angles: number[] = []
  
  // Create moderately irregular angle distribution
  let currentAngle = Math.random() * Math.PI * 2
  for (let i = 0; i < vertexCount; i++) {
    angles.push(currentAngle)
    // Moderate angle gap variation (0.5 to 0.9 radians)
    currentAngle += 0.5 + Math.random() * 0.4
  }
  angles.sort((a, b) => a - b)

  // Create vertices with moderate radius variation
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i]!
    // Moderate variance: 0.7 to 1.3 (subtle irregularity)
    const variance = 0.7 + Math.random() * 0.6
    vertices.push({
      x: Math.cos(angle) * baseRadius * variance,
      y: Math.sin(angle) * baseRadius * variance,
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
    hp: health,
    maxHp: health,
  }
}

// Split asteroid with proper mass conservation based on actual radius
function splitAsteroid(asteroid: AsteroidState): AsteroidState[] {
  if (asteroid.size === 'small') return []
  
  const fragments: AsteroidState[] = []
  
  // Calculate parent "mass" (area proportional to radius squared)
  const parentMass = Math.PI * asteroid.radius * asteroid.radius
  
  if (asteroid.size === 'large') {
    // Large breaks into varied fragments conserving ~60-80% of mass
    // Options: 3 medium, 2 medium + 2 small, 1 medium + 3 small, etc.
    const breakupType = Math.floor(Math.random() * 4)
    
    if (breakupType === 0) {
      // 3 medium fragments (~33% mass each)
      for (let i = 0; i < 3; i++) {
        fragments.push(createAsteroid(asteroid.x, asteroid.y, 'medium'))
      }
    } else if (breakupType === 1) {
      // 2 medium + 2 small
      for (let i = 0; i < 2; i++) {
        fragments.push(createAsteroid(asteroid.x, asteroid.y, 'medium'))
      }
      for (let i = 0; i < 2; i++) {
        fragments.push(createAsteroid(asteroid.x, asteroid.y, 'small'))
      }
    } else if (breakupType === 2) {
      // 1 medium + 3-4 small
      fragments.push(createAsteroid(asteroid.x, asteroid.y, 'medium'))
      const smallCount = 3 + Math.floor(Math.random() * 2)
      for (let i = 0; i < smallCount; i++) {
        fragments.push(createAsteroid(asteroid.x, asteroid.y, 'small'))
      }
    } else {
      // 4-5 small fragments
      const smallCount = 4 + Math.floor(Math.random() * 2)
      for (let i = 0; i < smallCount; i++) {
        fragments.push(createAsteroid(asteroid.x, asteroid.y, 'small'))
      }
    }
  } else if (asteroid.size === 'medium') {
    // Medium breaks into 2-3 small fragments
    const smallCount = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < smallCount; i++) {
      fragments.push(createAsteroid(asteroid.x, asteroid.y, 'small'))
    }
  }
  
  // Tamer breakup velocities with some inheritance from parent
  for (const fragment of fragments) {
    const spreadAngle = Math.random() * Math.PI * 2
    const spreadSpeed = 0.5 + Math.random() * 1.5
    // Inherit some parent velocity
    fragment.vx = asteroid.vx * 0.3 + Math.cos(spreadAngle) * spreadSpeed
    fragment.vy = asteroid.vy * 0.3 + Math.sin(spreadAngle) * spreadSpeed
  }
  
  return fragments
}

// Initialize asteroids
for (let i = 0; i < 50; i++) {
  asteroids.push(createAsteroid())
}

// Spawn letter drop at position
function spawnLetterDrop(x: number, y: number, vx: number, vy: number) {
  // 40% chance to drop a letter
  if (Math.random() > 0.4) return
  
  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]
  letterDrops.push({
    id: `l-${Date.now()}-${Math.random()}`,
    x, y,
    vx: vx * 0.5 + (Math.random() - 0.5) * 2,
    vy: vy * 0.5 + (Math.random() - 0.5) * 2,
    letter,
    life: 600, // 10 seconds at 60fps
    collected: false,
  })
}

// Check if player collected any letters
function checkLetterCollection(player: Player) {
  const collectionRadius = 30
  for (const drop of letterDrops) {
    if (drop.collected) continue
    if (distance(player.ship, drop) < collectionRadius) {
      drop.collected = true
      player.ship.score += 10 // Bonus points for collecting
      // Add to collected letters for trail
      if (!player.ship.collectedLetters) player.ship.collectedLetters = []
      player.ship.collectedLetters.push(drop.letter)
      // Keep trail manageable (max 15 letters)
      if (player.ship.collectedLetters.length > 15) {
        player.ship.collectedLetters.shift()
      }
      console.log(`[LETTER] ${player.name} collected '${drop.letter}'`)
    }
  }
  
  // Check if player is at base to deposit letters
  checkBaseDeposit(player)
}

// Check if player is at base and deposit letters
function checkBaseDeposit(player: Player) {
  const ship = player.ship
  const distToBase = Math.hypot(ship.x - BASE_POSITION.x, ship.y - BASE_POSITION.y)
  
  if (distToBase < BASE_RADIUS && ship.collectedLetters && ship.collectedLetters.length > 0) {
    // Player is at base - deposit letters
    const deposited = ship.collectedLetters.length
    ship.score += deposited * 5  // Bonus for depositing
    player.depositedLetterCount += deposited
    
    // Add letters to floating deposit pool
    for (const letter of ship.collectedLetters) {
      const angle = Math.random() * Math.PI * 2
      depositedLetters.push({
        letter,
        x: BASE_POSITION.x + Math.cos(angle) * BASE_RADIUS * 0.5,
        y: BASE_POSITION.y + Math.sin(angle) * BASE_RADIUS * 0.5,
        life: 1200,  // 20 seconds
      })
    }
    
    console.log(`[BASE] ${player.name} deposited ${deposited} letters (total: ${player.depositedLetterCount})`)
    ship.collectedLetters = []  // Clear collected letters
    
    // Limit deposited letters (prevent memory growth)
    while (depositedLetters.length > 100) {
      depositedLetters.shift()
    }
    
    // Trigger challenge if player has 5+ letters deposited
    if (player.depositedLetterCount >= 5 && !player.currentChallenge) {
      startChallenge(player)
    }
  }
}

// Start a new SATs challenge for player
function startChallenge(player: Player) {
  const categories = Object.keys(SATS_CATEGORIES)
  const category = categories[Math.floor(Math.random() * categories.length)]
  
  // Get challenges for this category
  const categoryChallenges = SATS_CHALLENGES.find(c => c.category === category)
  if (!categoryChallenges) return
  
  const sentenceIndex = Math.floor(Math.random() * categoryChallenges.sentences.length)
  
  player.currentChallenge = {
    category,
    sentenceIndex,
    startTime: Date.now(),
    usedHints: 0,
  }
  
  // Notify player
  io.to(player.id).emit('challenge-start', {
    category: SATS_CATEGORIES[category as keyof typeof SATS_CATEGORIES],
    sentence: categoryChallenges.sentences[sentenceIndex],
  })
  
  console.log(`[CHALLENGE] ${player.name} started ${category} challenge`)
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
      collectedLetters: [],
    },
    input: { ...DEFAULT_INPUT },
    inputSeq: 0,
    fireCooldown: 0,
    depositedLetterCount: 0,
    challengeStreak: 0,
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
    letterDrops: letterDrops.filter(d => !d.collected), // Only send uncollected
    depositedLetters,  // Letters floating at base
    gameActive,
    timeRemaining: gameActive ? Math.max(0, gameMode.duration - (Date.now() - gameStartTime)) : 0,
    // Challenge state per player (only send to relevant player via socket)
  }
  io.emit('state', state)
  
  // Send challenge state to players who have active challenges
  for (const [playerId, player] of players.entries()) {
    if (player.currentChallenge) {
      const categoryChallenges = SATS_CHALLENGES.find(c => c.category === player.currentChallenge?.category)
      if (categoryChallenges) {
        io.to(playerId).emit('challenge-active', {
          category: SATS_CATEGORIES[player.currentChallenge.category as keyof typeof SATS_CATEGORIES],
          sentence: categoryChallenges.sentences[player.currentChallenge.sentenceIndex],
          timeElapsed: Date.now() - player.currentChallenge.startTime,
        })
      }
    }
  }
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
  
  // Handle challenge answer
  socket.on('challenge-answer', (data: { answer: string }) => {
    const player = players.get(socket.id)
    if (!player || !player.currentChallenge) return
    
    const categoryChallenges = SATS_CHALLENGES.find(c => c.category === player.currentChallenge?.category)
    if (!categoryChallenges) return
    
    const challenge = categoryChallenges.sentences[player.currentChallenge.sentenceIndex]
    if (!challenge) return
    
    const isCorrect = data.answer.toLowerCase().trim() === challenge.answer.toLowerCase()
    const timeTaken = (Date.now() - player.currentChallenge.startTime) / 1000
    
    let points = 0
    if (isCorrect) {
      points = SCORING.correctWord
      if (timeTaken < 10) points += SCORING.bonusSpeed
      points += player.challengeStreak * SCORING.streakBonus
      player.challengeStreak++
    } else {
      player.challengeStreak = 0
    }
    
    player.ship.score += points
    player.currentChallenge = undefined
    
    // Send result to player
    socket.emit('challenge-result', {
      correct: isCorrect,
      correctAnswer: challenge.answer,
      points,
      streak: player.challengeStreak,
    })
    
    console.log(`[CHALLENGE] ${player.name} ${isCorrect ? 'correct' : 'wrong'} (+${points} points)`)
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

        // Store hit position for particle event
        const hitX = asteroid.x
        const hitY = asteroid.y

        // Damage asteroid
        asteroid.hp--
        
        // Send hit particle event to all clients
        io.emit('event', {
          type: 'asteroid-hit',
          x: hitX,
          y: hitY,
          size: asteroid.size,
        })

        // Only destroy if HP depleted
        if (asteroid.hp <= 0) {
          // Store velocity for letter spawn
          const asteroidVx = asteroid.vx
          const asteroidVy = asteroid.vy
          
          // Split asteroid using the new varied split function
          if (asteroid.size !== 'small') {
            const fragments = splitAsteroid(asteroid)
            asteroids.splice(ai, 1, ...fragments)
          } else {
            asteroids.splice(ai, 1)
          }

          // Spawn letter drop(s) based on asteroid size
          if (asteroid.size === 'large') {
            spawnLetterDrop(hitX, hitY, asteroidVx, asteroidVy)
            if (Math.random() > 0.5) {
              spawnLetterDrop(hitX, hitY, asteroidVx, asteroidVy)
            }
          } else if (asteroid.size === 'medium') {
            spawnLetterDrop(hitX, hitY, asteroidVx, asteroidVy)
          }

          const owner = players.get(bullet.ownerId)
          if (owner) {
            owner.ship.score += asteroid.size === 'large' ? 20 : asteroid.size === 'medium' ? 50 : 100
          }
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
          
          a1.vx -= impulse * m2 * nx * 0.7
          a1.vy -= impulse * m2 * ny * 0.7
          a2.vx += impulse * m1 * nx * 0.7
          a2.vy += impulse * m1 * ny * 0.7
          
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

  // Update letter drops
  for (let i = letterDrops.length - 1; i >= 0; i--) {
    const drop = letterDrops[i]!
    drop.x += drop.vx
    drop.y += drop.vy
    const wrapped = wrapPosition(drop.x, drop.y)
    drop.x = wrapped.x
    drop.y = wrapped.y
    drop.life--
    
    // Remove if expired or collected
    if (drop.life <= 0 || drop.collected) {
      letterDrops.splice(i, 1)
    }
  }

  // Update deposited letters at base (simple stable orbit)
  for (let i = depositedLetters.length - 1; i >= 0; i--) {
    const letter = depositedLetters[i]!
    
    const dx = letter.x - BASE_POSITION.x
    const dy = letter.y - BASE_POSITION.y
    const dist = Math.hypot(dx, dy)
    const targetRadius = 50
    
    if (dist > 0.1) {
      const nx = dx / dist
      const ny = dy / dist
      const px = -ny
      const py = nx
      
      const orbitSpeed = 0.8
      letter.x += px * orbitSpeed
      letter.y += py * orbitSpeed
      
      const radiusError = dist - targetRadius
      letter.x -= nx * radiusError * 0.001
      letter.y -= ny * radiusError * 0.001
    }
    
    letter.life--
    if (letter.life <= 0) {
      depositedLetters.splice(i, 1)
    }
  }

  // Check letter collection for all players
  for (const player of players.values()) {
    if (player.ship.alive) {
      checkLetterCollection(player)
    }
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
