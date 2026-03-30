# Pretext Asteroids MP

Educational multiplayer asteroids game with SATs spelling challenges. Built with Pretext-style text rendering, Socket.io multiplayer, and (planned) LLM-generated dynamic questions.

**Live Demo:** http://192.168.0.200:3000

## Quick Start

```bash
# Install
bun install

# Start server
CLIENT_DIR=./client bun run server/src/index.ts

# LAN access
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

## Architecture

```
client/          # Canvas rendering, Socket.io client
server/          # Game logic, physics, Socket.io server
shared/          # TypeScript types, SATs database
```

## Tech Stack

- **Runtime:** Bun 1.3.11
- **Server:** Express + Socket.io
- **Client:** Vanilla JS + Canvas API
- **LLM:** NVIDIA API (deepseek-v3.2) - planned

## Development

```bash
# Type check
bun run check

# Git workflow
git add -A && git commit -m "message" && git push origin main
```

## Current Features

✅ Core asteroids gameplay
✅ Letter collection and trails
✅ Base deposit with spiral display
✅ SATs challenge system
✅ Multiplayer support
✅ Scoring and streaks
✅ Visual polish (rotation, particles)

## Planned Features

🔄 LLM dynamic question generation
⏸️ Pause game during challenges
🔤 Letter-based bonus system
📊 Leaderboards

## Repository

https://github.com/samgrowls/pretext-asteroids-mp

## Documentation

- `HANDOFF.md` - Comprehensive developer handoff
- `shared/src/sats-words.ts` - SATs word database
- `server/src/index.ts` - Main game logic
