# Pretext Asteroids MP

Educational multiplayer asteroids game combining classic arcade gameplay with Year 6 SATs spelling challenges. Built with Pretext-style text rendering, Socket.io multiplayer, and LLM-generated dynamic questions.

**Live Demo:** http://192.168.0.200:3000

## Quick Start

```bash
# Install
bun install

# Start server
CLIENT_DIR=./client bun run server/src/index.ts

# Start with LAN access
CLIENT_DIR=./client HOST=0.0.0.0 bun run server/src/index.ts
```

## Gameplay

1. **Destroy asteroids** - Large (6-8 hits), Medium (3-4), Small (1)
2. **Collect letters** - 40% drop chance, trail behind ship
3. **Deposit at base** - Fly to green zone (shown on radar)
4. **Complete challenges** - SATs sentence completion after 5+ letters
5. **Earn points** - Collection, deposition, correct spelling, streaks

## Scoring

| Action | Points |
|--------|--------|
| Collect letter | +10 |
| Deposit letter | +5 |
| Correct spelling | +50 |
| Speed bonus (<10s) | +25 |
| Streak bonus | +10 each |

## Challenge Categories

- Common Exception Words (pedestrian, awkward, summit)
- Prefixes & Suffixes (decoration, explosion)
- Homophones (They're/Their/There)
- Word Families (structure/construct)
- Tricky Endings (-ture, -cial, -tial)

## LLM Integration

Dynamic questions are generated using NVIDIA API:
- **Model:** qwen/qwen3.5-397b-a17b
- **Context:** Uses letters player has collected
- **Fallback:** Static SATs database if LLM fails
- **Timeout:** 5 seconds with automatic fallback

## Architecture

```
client/          # Canvas rendering, Socket.io client
server/          # Game logic, physics, Socket.io server, LLM integration
shared/          # TypeScript types, SATs database
```

## Tech Stack

- **Runtime:** Bun 1.3.11
- **Server:** Express + Socket.io
- **Client:** Vanilla JS + Canvas API
- **LLM:** NVIDIA API (qwen3.5-397b)

## Development

```bash
# Type check
bun run check

# Git workflow
git add -A && git commit -m "message" && git push origin main
```

## Current Features

✅ Core asteroids gameplay
✅ HP system with varied asteroid sizes
✅ Letter drops with rotation physics
✅ Letter collection and trail system
✅ Base deposit with spiral display
✅ SATs challenge system
✅ **LLM dynamic question generation (NVIDIA API)**
✅ Multiplayer support
✅ Scoring and streaks
✅ Visual polish (particles, rotation)

## Planned Features

⏸️ Game pause during challenges
⏸️ Letter-based bonus system
⏸️ Drag-and-drop letter selection (optional)

## Repository

https://github.com/samgrowls/pretext-asteroids-mp

## Documentation

- `HANDOFF.md` - Comprehensive developer handoff
- `QWEN.md` - Agent context and technical details
- `shared/src/sats-words.ts` - SATs word database
