# Pretext Asteroids MP - QWEN.md

## Project Overview

Educational multiplayer asteroids game combining classic arcade gameplay with Year 6 SATs spelling challenges. Players destroy asteroids, collect letter drops, deposit at base, and complete dynamic spelling questions.

**Repository:** https://github.com/samgrowls/pretext-asteroids-mp
**Live Demo:** http://192.168.0.200:3000

## Building and Running

### Prerequisites
- Bun 1.3.11+
- NVIDIA API key (for LLM features)

### Commands

```bash
# Install dependencies
bun install

# Start development server
CLIENT_DIR=./client bun run server/src/index.ts

# Start with LAN access
CLIENT_DIR=./client HOST=0.0.0.0 bun run server/src/index.ts

# Type check
bun run check
```

### Access
- Local: http://localhost:3000
- LAN: http://<your-ip>:3000

## Architecture

### Directory Structure
```
pretext-asteroids-mp/
├── client/
│   ├── index.html          # Game canvas + UI + rendering
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.ts        # Main game logic, physics, Socket.io
│   │   └── llm-challenges.ts  # TODO: LLM integration
│   └── package.json
├── shared/
│   ├── src/
│   │   ├── index.ts        # Shared TypeScript types
│   │   └── sats-words.ts   # SATs word database (40+ templates)
│   └── package.json
└── package.json            # Workspace root
```

### Key Files
- `server/src/index.ts` - Core game loop, physics, Socket.io handlers
- `client/index.html` - Canvas rendering, Socket.io client, UI
- `shared/src/sats-words.ts` - SATs categories and sentence templates
- `HANDOFF.md` - Comprehensive developer documentation

## Game Mechanics

### Core Loop
1. Fly ship (WASD/Arrows)
2. Destroy asteroids (multiple hits based on size)
3. Collect letter drops (40% chance, float with physics)
4. Return to base (green zone at center, shown on radar)
5. Deposit letters (auto when in zone)
6. Complete SATs challenge (after 5+ deposits)
7. Earn points and continue

### Physics
- **Ship:** Thrust, rotation, friction, max speed
- **Asteroids:** Velocity, rotation, wrapping, breakup
- **Letters:** Velocity, rotation, collection radius
- **Base letters:** Static spiral display (no physics)

### Scoring
- Letter collected: +10
- Letter deposited: +5
- Correct spelling: +50
- Speed bonus (<10s): +25
- Streak bonus: +10 per consecutive

## Development Conventions

### Code Style
- TypeScript with strict mode
- ES modules (import/export)
- Socket.io for real-time communication
- Canvas API for rendering

### Testing
- Manual testing in browser
- Multiple browser windows for multiplayer
- Console logging for debugging

### Git Workflow
```bash
git add -A
git commit -m "Descriptive message"
git push origin main
```

## Current Status

### Completed ✅
- Core asteroids gameplay
- HP system with varied asteroid sizes
- Letter drops with rotation physics
- Letter collection and trail system
- Base deposit with spiral display
- SATs challenge UI and logic
- **LLM dynamic question generation (NVIDIA API, qwen3.5-397b)**
- Multiplayer support
- Scoring and streaks
- Visual polish (particles, rotation)

### In Progress 🔄
- Game pause during challenges
- Letter-based bonus system

### Known Issues
- Base letters were jittering (FIXED - removed camera wrap)
- Challenge UI timing (FIXED - added setTimeout)

## LLM Integration (COMPLETED ✅)

### Implementation
```typescript
// server/src/llm-challenges.ts
import { getCachedChallenge } from './llm-challenges'

// In startChallenge():
const collectedLetters = Array.from(player.collectedLetterSet)
const llmChallenge = await getCachedChallenge(collectedLetters, 'medium')

// Falls back to static challenges if LLM fails
```

### API Details
- **Model:** qwen/qwen3.5-397b-a17b
- **Endpoint:** https://integrate.api.nvidia.com/v1/chat/completions
- **Key:** NVIDIA_API_KEY from ~/.env
- **Caching:** 50 challenge cache to prevent duplicate calls
- **Fallback:** Static SATs database if LLM fails

### Challenge Flow
1. Player deposits 5+ letters at base
2. System collects unique letters from player
3. LLM generates question using those letters
4. Question sent to player via Socket.io
5. Player submits answer
6. Server validates and awards points

## Socket Events

### Client → Server
- `join` - Join game
- `input` - Control input
- `challenge-answer` - Submit answer
- `ping` - Latency check

### Server → Client
- `state` - Game state (60 TPS)
- `challenge-start` - New challenge
- `challenge-result` - Result feedback
- `event` - Game events

## Performance Notes

- Server runs at 60 TPS (16.67ms tick)
- Client renders at 60 FPS
- Socket.io for real-time sync
- Canvas for efficient rendering
- Static base letters (no physics) for optimization

## Related Documentation

- `README.md` - User-facing documentation
- `HANDOFF.md` - Developer handoff guide
- `shared/src/sats-words.ts` - SATs database
