# Pretext Asteroids MP - Handoff Document

## Project Overview

**Pretext Asteroids MP** is an educational multiplayer game that combines classic asteroids gameplay with Year 6 SATs spelling challenges. Players destroy asteroids, collect letter drops, deposit them at base, and complete spelling challenges generated dynamically by LLM.

**Repository:** https://github.com/samgrowls/pretext-asteroids-mp

**Live Demo:** http://192.168.0.200:3000

---

## Current Status ✅

### Completed Features:
1. **Core Gameplay**
   - Ship movement with thrust/rotation
   - Asteroid spawning with varied sizes (large/medium/small)
   - HP system (large: 6-8 hits, medium: 3-4, small: 1)
   - Varied asteroid breakup (mass-conserving)
   - Letter drops from asteroids (40% chance)
   - Letter collection and trail system
   - Home base with static spiral letter display
   - Asteroid rotation (gentle spin)
   - Letter drop rotation

2. **SATs Challenge System**
   - 5 categories: Common Exceptions, Prefixes/Suffixes, Homophones, Word Families, Tricky Endings
   - 40+ sentence templates with blanks
   - **LLM dynamic question generation** using NVIDIA API (qwen3.5-397b)
   - Challenge triggers after depositing 5+ letters
   - Scoring: 50pts correct, +25 speed bonus, +10 streak
   - Challenge UI with timer, hints, and feedback

3. **Visual Polish**
   - Seamless world wrapping
   - Rotating asteroids
   - Rotating letter drops
   - Letter trail behind ship (flocking behavior)
   - Static spiral display at base (no jitter)
   - Particle effects (afterburners, explosions, hits)
   - Radar with relative positions

4. **Multiplayer**
   - Socket.io based
   - Multiple players can play simultaneously
   - Individual challenge tracking
   - Shared game world
   - Input reset on tab switch (blur handler)

---

## Next Steps 📋

### 1. Game Pause During Challenges (MEDIUM PRIORITY)

**Goal:** Freeze game state when challenge panel is open.

**Implementation:**
```javascript
// Server: Add pause state to Player type
currentChallenge?: {
  // ... existing fields
  gamePaused: boolean
}

// When challenge starts:
player.currentChallenge.gamePaused = true

// In updatePhysics():
for (const player of players.values()) {
  if (player.currentChallenge?.gamePaused) continue
  // ... update physics
}
```

### 2. Letter-Based Bonus System (LOW PRIORITY)

**Goal:** Reward players for using collected letters in answers.

**Implementation:**
```javascript
// Track which letters each player has deposited
depositedLetterCounts: Map<string, number>  // letter -> count

// When checking answer:
const usedLetters = answer.toLowerCase().split('')
const bonusPoints = usedLetters.filter(l => 
  player.depositedLetterCounts.get(l) > 0
).length * 5

player.ship.score += points + bonusPoints
```

### 3. Drag-and-Drop Letter Selection (OPTIONAL)

**Consideration:** Instead of typing, players drag letters to fill blanks.

**Pros:** More game-like, uses collected letters directly
**Cons:** More complex UI, may not work well on all devices

**Decision:** Keep text input for now, add drag-drop as optional enhancement.

---

## Architecture

### File Structure
```
pretext-asteroids-mp/
├── client/
│   ├── index.html          # Main game page + UI
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.ts        # Main server + game logic
│   │   └── llm-challenges.ts  # LLM integration
│   └── package.json
├── shared/
│   ├── src/
│   │   ├── index.ts        # Shared types
│   │   └── sats-words.ts   # SATs word database
│   └── package.json
├── package.json            # Workspace root
└── .env                    # API keys (NVIDIA_API_KEY)
```

### Tech Stack
- **Runtime:** Bun 1.3.11
- **Server:** Bun + Express + Socket.io
- **Client:** Vanilla JS + Canvas API
- **Shared:** TypeScript types via workspace
- **LLM:** NVIDIA API (qwen3.5-397b model)

### Key Constants
```typescript
// Game
WORLD_SIZE = 4000
BASE_RADIUS = 150
BASE_POSITION = { x: 2000, y: 2000 }

// Challenges
CHALLENGE_TRIGGER_LETTERS = 5
SCORING = {
  correctWord: 50,
  bonusSpeed: 25,
  streakBonus: 10,
  letterCollection: 10,
  letterDeposit: 5
}
```

---

## Development Commands

```bash
# Install dependencies
bun install

# Start server (development)
cd pretext-asteroids-mp
CLIENT_DIR=./client bun run server/src/index.ts

# Start server (LAN access)
CLIENT_DIR=./client HOST=0.0.0.0 bun run server/src/index.ts

# Type check
bun run check
```

---

## API Reference

### Socket Events (Client → Server)
- `join` - Join game with player name
- `input` - Send control input (thrust, left, right, fire, teleport)
- `challenge-answer` - Submit challenge answer
- `ping` - Latency check

### Socket Events (Server → Client)
- `state` - Game state update (60 TPS)
- `challenge-start` - New challenge triggered
- `challenge-active` - Challenge state update
- `challenge-result` - Challenge result (correct/wrong + points)
- `event` - Game events (player-died, asteroid-hit, etc.)

---

## Testing Checklist

- [x] Ship movement (thrust, rotation, friction)
- [x] Asteroid destruction (HP, breakup)
- [x] Letter collection (drops, trail)
- [x] Base deposit (spiral display, challenge trigger)
- [x] Challenge UI (display, input, submit, result)
- [x] Scoring (collection, deposit, correct, streak)
- [x] Multiplayer (multiple players, individual challenges)
- [x] LLM challenges (dynamic question generation)
- [ ] Game pause during challenges
- [ ] Letter-based bonus system

---

## LLM Integration Details

### File: `server/src/llm-challenges.ts`

**Key Functions:**
- `generateLLMChallenge(letters, difficulty)` - Calls NVIDIA API
- `getCachedChallenge(letters, difficulty)` - With 5-min TTL cache
- `getFallbackChallenge()` - Static challenge fallback

**API Call:**
```typescript
const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'qwen/qwen3.5-397b-a17b',
    messages: [/* prompt */],
    temperature: 0.7,
    max_tokens: 300,
  }),
  signal: controller.signal,  // 5s timeout
})
```

**Error Handling:**
- Timeout after 5 seconds
- Falls back to static challenges
- Logs errors to console

---

## Contact / Notes

- **NVIDIA API Key:** Available in `~/.env`
- **Recommended Model:** `qwen/qwen3.5-397b-a17b`
- **Fallback:** Static SATs challenges in `shared/src/sats-words.ts`
- **Current Issues:** None known

---

## Quick Start for Next Developer

1. Read this document
2. Review `server/src/index.ts` for game logic
3. Review `server/src/llm-challenges.ts` for LLM integration
4. Review `shared/src/sats-words.ts` for challenge database
5. Test with `CLIENT_DIR=./client bun run server/src/index.ts`
6. Open `http://localhost:3000` in browser

Good luck! 🚀
