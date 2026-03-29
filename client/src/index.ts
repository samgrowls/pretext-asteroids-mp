import geckos from '@geckos.io/client'
import { 
  WORLD_SIZE, SHIP_SIZE, SHIP_COLLISION_RADIUS, ASTEROID_COLLISION_FACTOR,
  type ShipState, type AsteroidState, type BulletState,
  type InputState, DEFAULT_INPUT,
} from '@asteroids/shared'

// --- Connection ---
const connection = geckos({ url: window.location.origin, port: 3000 })
let playerId: string | null = null

const connectionStatus = document.getElementById('connection-status')!

connection.onConnect(() => {
  console.log('[+] Connected to server')
  connectionStatus.textContent = 'Connected'
  connectionStatus.style.color = '#0a0'
})

connection.onDisconnect((reason: any) => {
  console.log('[-] Disconnected:', reason)
  connectionStatus.textContent = 'Disconnected'
  connectionStatus.style.color = '#a00'
})

// --- Game State ---
const localShip: ShipState & { prevX: number; prevY: number } = {
  id: '', name: '', x: 0, y: 0, vx: 0, vy: 0, angle: 0,
  alive: true, score: 0, deaths: 0, kills: 0,
  prevX: 0, prevY: 0,
}

const remoteShips = new Map<string, ShipState>()
const asteroids: AsteroidState[] = []
const bullets: BulletState[] = []

// --- Input ---
const input: InputState = { ...DEFAULT_INPUT }
let inputSeq = 0
let fireHeld = false

// --- Canvas Setup ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const radarCanvas = document.getElementById('radar') as HTMLCanvasElement
const radarCtx = radarCanvas.getContext('2d')!
const hud = document.getElementById('hud')!

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx.scale(dpr, dpr)
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// --- Camera ---
const camera = { x: 0, y: 0 }

function updateCamera(dt: number) {
  // Smooth follow
  camera.x += (localShip.x - camera.x) * 0.1
  camera.y += (localShip.y - camera.y) * 0.1
  
  // Clamp to world bounds
  const vw = window.innerWidth
  const vh = window.innerHeight
  camera.x = Math.max(0, Math.min(WORLD_SIZE - vw, camera.x))
  camera.y = Math.max(0, Math.min(WORLD_SIZE - vh, camera.y))
}

// --- Input Handling ---
const keysDown = new Set<string>()

document.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault()
  }
  keysDown.add(e.code)
  
  updateInputFromKeys()
  
  if (e.code === 'Space' && !fireHeld) {
    input.fire = true
    fireHeld = true
  }
})

document.addEventListener('keyup', (e) => {
  keysDown.delete(e.code)
  updateInputFromKeys()
  
  if (e.code === 'Space') {
    fireHeld = false
  }
})

function updateInputFromKeys() {
  input.thrust = keysDown.has('ArrowUp') || keysDown.has('KeyW')
  input.left = keysDown.has('ArrowLeft') || keysDown.has('KeyA')
  input.right = keysDown.has('ArrowRight') || keysDown.has('KeyD')
}

// Join UI
const joinScreen = document.getElementById('join-screen')!
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement
const nameInput = document.getElementById('player-name') as HTMLInputElement

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click()
})

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Player'
  connection.emit('join', { name })
  joinScreen.classList.add('hidden')
})

// Focus name input on load
nameInput.focus()

// --- Network Handlers ---
connection.on('welcome', (data: any) => {
  playerId = data.playerId
  localShip.id = playerId!
  localShip.name = 'You'
  console.log('[*] Welcome! Player ID:', playerId)
})

connection.on('state', (data: any) => {
  // Update local ship from server
  const serverShip = data.ships.find((s: ShipState) => s.id === playerId)
  if (serverShip) {
    localShip.prevX = localShip.x
    localShip.prevY = localShip.y
    localShip.x = serverShip.x
    localShip.y = serverShip.y
    localShip.vx = serverShip.vx
    localShip.vy = serverShip.vy
    localShip.angle = serverShip.angle
    localShip.alive = serverShip.alive
    localShip.score = serverShip.score
    localShip.deaths = serverShip.deaths
    localShip.kills = serverShip.kills
  }
  
  // Update remote ships
  remoteShips.clear()
  for (const ship of data.ships) {
    if (ship.id !== playerId) {
      remoteShips.set(ship.id, ship)
    }
  }
  
  // Update asteroids and bullets
  asteroids.length = 0
  asteroids.push(...data.asteroids)
  bullets.length = 0
  bullets.push(...data.bullets)
})

connection.on('event', (event: any) => {
  console.log('[EVENT]', event)
})

// --- Send Input Loop ---
setInterval(() => {
  if (!playerId) return
  
  connection.emit('input', {
    seq: inputSeq++,
    thrust: input.thrust,
    left: input.left,
    right: input.right,
    fire: input.fire,
    teleport: input.teleport,
  })
  
  input.fire = false // Reset fire flag
  input.teleport = false
}, 1000 / 60)

// --- Rendering ---
const ASTEROID_GLYPHS = '▓▒░█▀▄■●◐◑◒◓⬡⬢◆◇○●'

function renderAsteroid(asteroid: AsteroidState) {
  const screenX = asteroid.x - camera.x
  const screenY = asteroid.y - camera.y
  
  // Cull off-screen
  if (screenX < -100 || screenX > window.innerWidth + 100 ||
      screenY < -100 || screenY > window.innerHeight + 100) return
  
  ctx.save()
  ctx.translate(screenX, screenY)
  
  const density = asteroid.size === 'large' ? 9 : asteroid.size === 'medium' ? 7 : 5
  const fontSize = asteroid.size === 'large' ? 13 : asteroid.size === 'medium' ? 10 : 8
  
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = asteroid.size === 'large' ? 0.95 : asteroid.size === 'medium' ? 0.85 : 0.75
  
  for (const vertex of asteroid.vertices) {
    const glyph = ASTEROID_GLYPHS[Math.floor(Math.abs(vertex.x + vertex.y) % ASTEROID_GLYPHS.length)]!
    const shadeIndex = ASTEROID_GLYPHS.indexOf(glyph)
    const lightness = 55 + ((shadeIndex >= 0 ? shadeIndex : 0) % 5) * 7
    ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`
    ctx.font = `bold ${fontSize}px "Courier New", monospace`
    ctx.fillText(glyph, vertex.x, vertex.y)
  }
  
  ctx.globalAlpha = 1
  ctx.restore()
}

function renderShip(ship: ShipState, isLocal: boolean) {
  if (!ship.alive) return
  
  const screenX = ship.x - camera.x
  const screenY = ship.y - camera.y
  
  // Cull off-screen
  if (screenX < -50 || screenX > window.innerWidth + 50 ||
      screenY < -50 || screenY > window.innerHeight + 50) return
  
  ctx.save()
  ctx.translate(screenX, screenY)
  ctx.rotate(ship.angle + Math.PI / 2)
  
  ctx.fillStyle = isLocal ? '#fff' : ship.team === 'red' ? '#f66' : '#66f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  const glyphs = ['▲', '◢', '◣']
  const positions = [
    { x: 0, y: -SHIP_SIZE / 2, size: 20 },
    { x: -SHIP_SIZE / 3, y: SHIP_SIZE / 3, size: 12, angle: -0.3 },
    { x: SHIP_SIZE / 3, y: SHIP_SIZE / 3, size: 12, angle: 0.3 },
  ]
  
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!
    ctx.save()
    ctx.translate(pos.x, pos.y)
    if (pos.angle) ctx.rotate(pos.angle)
    ctx.font = `bold ${pos.size}px "Courier New", monospace`
    ctx.fillText(glyphs[i]!, 0, 0)
    ctx.restore()
  }
  
  ctx.restore()
  
  // Name tag
  ctx.fillStyle = isLocal ? '#0f0' : '#ff0'
  ctx.font = '12px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.fillText(ship.name || 'Player', screenX, screenY - 30)
}

function renderBullet(bullet: BulletState) {
  const screenX = bullet.x - camera.x
  const screenY = bullet.y - camera.y
  
  // Cull off-screen
  if (screenX < 0 || screenX > window.innerWidth ||
      screenY < 0 || screenY > window.innerHeight) return
  
  ctx.fillStyle = '#ff0'
  ctx.font = 'bold 14px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('●', screenX, screenY)
}

function renderRadar() {
  const size = 150
  const centerX = size / 2
  const centerY = size / 2
  const scale = size / WORLD_SIZE

  radarCtx.clearRect(0, 0, size, size)

  // Background
  radarCtx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  radarCtx.beginPath()
  radarCtx.arc(centerX, centerY, size / 2, 0, Math.PI * 2)
  radarCtx.fill()

  // Asteroids
  radarCtx.fillStyle = '#444'
  for (const asteroid of asteroids) {
    const x = centerX + asteroid.x * scale
    const y = centerY + asteroid.y * scale
    radarCtx.fillRect(x - 1, y - 1, 2, 2)
  }

  // Ships
  for (const ship of remoteShips.values()) {
    if (!ship.alive) continue
    const x = centerX + ship.x * scale
    const y = centerY + ship.y * scale
    radarCtx.fillStyle = '#f00'
    radarCtx.beginPath()
    radarCtx.moveTo(x, y - 3)
    radarCtx.lineTo(x - 2, y + 2)
    radarCtx.lineTo(x + 2, y + 2)
    radarCtx.closePath()
    radarCtx.fill()
  }

  // Local player
  if (localShip.alive && playerId) {
    const x = centerX + localShip.x * scale
    const y = centerY + localShip.y * scale
    radarCtx.fillStyle = '#0f0'
    radarCtx.beginPath()
    radarCtx.moveTo(x, y - 3)
    radarCtx.lineTo(x - 2, y + 2)
    radarCtx.lineTo(x + 2, y + 2)
    radarCtx.closePath()
    radarCtx.fill()
  }
}

function renderHUD() {
  hud.innerHTML = `
    <div>SCORE: ${localShip.score.toString().padStart(6, '0')}</div>
    <div>KILLS: ${localShip.kills}</div>
    <div>DEATHS: ${localShip.deaths}</div>
    <div style="margin-top: 10px; color: #888;">
      Players: ${remoteShips.size + (playerId ? 1 : 0)}
    </div>
  `
}

// --- Main Loop ---
let lastTime = performance.now()

function gameLoop(currentTime: number) {
  const dt = currentTime - lastTime
  lastTime = currentTime
  
  // Clear
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
  
  // Update camera
  if (playerId && localShip.alive) {
    updateCamera(dt)
  }
  
  // Render world
  for (const asteroid of asteroids) {
    renderAsteroid(asteroid)
  }
  
  for (const bullet of bullets) {
    renderBullet(bullet)
  }
  
  for (const [id, ship] of remoteShips.entries()) {
    renderShip(ship, false)
  }
  
  if (playerId) {
    renderShip(localShip, true)
  }
  
  // Render UI
  renderRadar()
  renderHUD()
  
  requestAnimationFrame(gameLoop)
}

requestAnimationFrame(gameLoop)

console.log('🚀 Asteroids MP client starting...')
