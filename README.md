# Pretext Asteroids MP

Multiplayer asteroids game with **Geckos.io** WebRTC networking for low-latency (~20-30ms) gameplay. Built with the text-rendered aesthetic from Pretext.

## 🎮 Features

- **Large 4000x4000 pixel world** with camera follow
- **Real-time multiplayer** via WebRTC DataChannels
- **Text-rendered graphics** using Pretext glyph caching
- **Radar/minimap** showing all players and asteroids
- **Server-authoritative physics** at 60 TPS
- **Multiple game modes** (planned): FFA, Teams, CTF, King of the Hill

## 🚀 Quick Start

### Install dependencies

```bash
bun install
```

### Run development server

```bash
bun run dev
```

This starts both the server and client in watch mode.

### Open in browser

Navigate to `http://localhost:3000`

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

### Phase 1: Foundation ✅ (Current)
- [x] Geckos.io server setup
- [x] Basic client connection
- [x] Ship position sync
- [x] Large world + camera
- [x] Basic radar
- [x] Bullets + asteroids

### Phase 2: Combat (Next)
- [ ] Server-authoritative collisions
- [ ] Death + respawn
- [ ] Score tracking
- [ ] Free For All mode

### Phase 3: Polish
- [ ] Client-side prediction
- [ ] Entity interpolation
- [ ] Lag compensation
- [ ] Improved radar

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
