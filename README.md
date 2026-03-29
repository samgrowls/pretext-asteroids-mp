# Pretext Asteroids MP

Multiplayer asteroids game with **Geckos.io** WebRTC networking for low-latency (~20-30ms) gameplay. Built with the text-rendered aesthetic from Pretext.

## 🎮 Features

- **Large 4000x4000 pixel world** with camera follow
- **Real-time multiplayer** via WebRTC DataChannels (~20-30ms latency)
- **Text-rendered graphics** using Pretext glyph caching
- **Radar/minimap** showing all players and asteroids
- **Server-authoritative physics** at 60 TPS
- **Death + respawn** (3 second respawn timer)
- **Score tracking** (asteroid kills + ship kills)
- **Live leaderboard** (top 5 players)
- **Game timer** (3 minute matches)
- **Teleport mechanic** (emergency dodge with score penalty)
- **Asteroid physics** (asteroid vs asteroid collisions)
- **Multiple game modes** (planned): FFA, Teams, CTF, King of the Hill

## 🚀 Quick Start

### Install dependencies

```bash
bun install
```

### Run development server

```bash
CLIENT_DIR=./client bun run server/src/index.ts
```

### Open in browser

Navigate to `http://localhost:3333`

**For LAN access** (like single-player version):

```bash
# Find your LAN IP
hostname -I | awk '{print $1}'

# Start server bound to all interfaces
HOST=0.0.0.0 CLIENT_DIR=./client bun run server/src/index.ts
```

Then access from other devices: `http://<your-lan-ip>:3333`

### Controls

| Key | Action |
|-----|--------|
| W / ↑ | Thrust |
| A / ← | Rotate left |
| D / → | Rotate right |
| Space | Fire |

## 🏗️ Architecture

```
┌──────────────┐         ┌──────────────┐
│   Client 1   │         │   Client 2   │
│              │         │              │
│  Local sim   │◄───────►│  Local sim   │
│  + predict   │  WebRTC │  + predict   │
└──────┬───────┘         └──────┬───────┘
       │                        │
       └──────────┬─────────────┘
                  │
         ┌────────▼────────┐
         │  Geckos.io      │
         │  Server         │
         │  (Authoritative)│
         └─────────────────┘
```

## 📁 Project Structure

```
pretext-asteroids-mp/
├── client/          # Browser game client
│   ├── src/
│   │   ├── game/    # Game entities
│   │   ├── net/     # Network code
│   │   ├── ui/      # HUD, radar, menus
│   │   └── render/  # Canvas rendering
│   └── index.html
├── server/          # Node.js game server
│   └── src/
│       ├── game/    # Physics, collisions
│       ├── modes/   # Game mode logic
│       └── net/     # Geckos.io server
└── shared/          # Shared types + constants
    └── src/
        └── index.ts
```

## 🎯 Development Phases

### Phase 1: Foundation ✅
- [x] Geckos.io server setup
- [x] Basic client connection
- [x] Ship position sync
- [x] Large world + camera
- [x] Basic radar
- [x] Bullets + asteroids

### Phase 2: Combat ✅ (Current)
- [x] Server-authoritative collisions
- [x] Ship vs asteroid collisions
- [x] Ship vs ship bullets
- [x] Death + respawn (3s timer)
- [x] Score tracking
- [x] Game timer (3 min matches)
- [x] Live leaderboard
- [x] Teleport mechanic
- [x] Asteroid replenishment

### Phase 3: Polish (Next)
- [ ] Client-side prediction
- [ ] Entity interpolation
- [ ] Lag compensation
- [ ] Improved radar (zoom, filters)
- [ ] Sound effects

### Phase 4: Game Modes
- [ ] Team Deathmatch
- [ ] Capture The Flag
- [ ] King of the Hill
- [ ] Survival (co-op)

## 🌐 Deployment

### Local network

```bash
bun run start
```

Then access from other devices: `http://<your-ip>:3000`

### Production (Docker)

```bash
docker build -t asteroids-mp ./server
docker run -p 3000:3000 asteroids-mp
```

## 📊 Performance

- **Server tick rate:** 60 TPS
- **Client render:** 60 FPS
- **Network latency:** ~20-30ms (WebRTC P2P)
- **World size:** 4000x4000 pixels
- **Max players:** 8 per room (planned)

## 🛠️ Tech Stack

- **Client:** TypeScript, Canvas API, Geckos.io Client
- **Server:** Bun, Express, Geckos.io Server
- **Shared:** TypeScript types + constants

## 📝 License

MIT

## 🙏 Credits

Built on the [Pretext](https://github.com/chenglou/pretext) text layout library.
