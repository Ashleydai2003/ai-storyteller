# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered Blood on the Clocktower (BOTC) Storyteller - a Kahoot-style web application where a host creates a room and players join via code on their phones. The AI handles creative storytelling elements while deterministic logic handles game mechanics.

**Rulebook:** https://wiki.bloodontheclocktower.com/

## Development Commands

```bash
pnpm install          # Install all dependencies
pnpm dev:all          # Start Next.js (port 3000) + PartyKit (port 1999)
pnpm dev:web          # Start only Next.js
pnpm dev:party        # Start only PartyKit
pnpm build            # Build all packages
```

## Project Structure

```
apps/web/             # Next.js 15 frontend (App Router)
├── src/app/          # Routes: /, /create, /join, /room/[code], /play/[code]
├── src/hooks/        # usePartySocket for WebSocket connection
├── src/stores/       # Zustand stores for client state
└── src/lib/          # Utilities (room code generation)

packages/game-logic/  # Pure TypeScript game logic
├── src/types/        # Player, Character, GameState, Messages
└── src/              # Character definitions, rules, abilities

party/                # PartyKit WebSocket server
└── src/room.ts       # Room state management, message handlers
```

## Tech Stack

- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **Real-time:** PartyKit (WebSocket server on Cloudflare Workers)
- **State:** Zustand (client-side)
- **Package Manager:** pnpm (monorepo with Turborepo)

## Architecture Principles

- **Host reveals no information**: The host screen must never display information that would give any player an advantage
- **Deterministic where possible**: AI only handles creative storytelling; game logic is deterministic
- **Game rules in markdown**: Rules should be stored in markdown files/prompts for easy reference
- **Stable client token for identity**: Player/host identity is a `crypto.randomUUID()` stored in `sessionStorage`, NOT the WebSocket connection ID. This survives page refreshes. See "Identity & Reconnection" below.

## Identity & Reconnection

Players and hosts are identified by a **stable UUID token** stored in `sessionStorage` (scoped per room code). The WebSocket connection ID is ephemeral and only used for message routing.

### How it works
- **Client**: On first visit, generates `crypto.randomUUID()` and stores it as `botc-token:{CODE}` (player) or `botc-host-token:{CODE}` (host) in `sessionStorage`. This token is sent with `player:join` and `host:create` messages.
- **Server**: Uses the token as `player.id` and `hostId`. Maintains ephemeral `token ↔ connectionId` maps (`tokenToConnectionId`, `connectionIdToToken`) for routing messages to the right WebSocket connection.
- **On refresh**: Same token is restored from `sessionStorage` → server recognizes the player by token, updates the connection mapping. No duplicate player, no re-prompting for name.
- **On tab close**: `sessionStorage` is cleared by the browser → fresh identity on next visit.
- **Player name**: Also persisted in `sessionStorage` as `botc-player-name:{CODE}`. Auto-sent with the token on reconnect.

### Key rule
- `player.id` is always the **token**, never the connection ID
- Use `sendToToken(token, message)` to send messages to a specific player
- Use `getTokenForConnection(connection)` to identify who sent a message

## Key Data Models

### Player Schema
- `id` (stable UUID token — NOT connection ID)
- `name`, `character` (what player thinks they are), `characterType` (townsfolk/imp/minion/outsider)
- `characterRegistration` (actual registration type, important for drunk/poisoned)
- `states[]` (drunk/poisoned/protected), `ability` (boolean)
- `ableToNominate`, `ableToBeNominated` (reset daily unless dead)
- `alive`, `deadVoted` (dead can vote once per game)

### Game State (RoomState — shared with clients)
- `hostId` (host's UUID token), `gameJoinCode`, `phase`
- `players[]`, `seatingOrder` (player token IDs in order)
- `roundNumber`, `isDay` (phase tracking)
- `playersOnBlock[]` (list for tie detection), `currentNomination`, `votesNeeded`

### Server-Only State (ServerGameState — never sent to clients)
- `demonBluffs` (3 townsfolk/outsider characters)
- `fortuneTellerRedHerring` (player token ID)
- `actualCharacters` (player token ID → actual character)

## Game Flow Implementation Order

1. **Room creation/joining** ✅ - Kahoot-style with 5+ player minimum, room code validation, token-based reconnection
2. **Character assignment** - Random bag generation per distribution rules
3. **Night phase** - Wake players sequentially per night order
4. **Day phase** - Timer-based nominations and voting system
5. **End conditions** - 3 players left with Imp, Imp executed, Mayor special ending

## Critical Edge Cases

- **Drunk**: Player sees a townsfolk character but is actually drunk; store as separate state
- **Poisoned**: Similar to drunk, affects information accuracy
- **Starpass**: Imp self-kill transfers Imp to random minion
- **Scarlet Woman**: Becomes Imp if Imp is executed or slayed
- **Baron**: If drawn as minion, changes game composition
- **Virgin**: If nominated by townsfolk, townsfolk dies (unless either is drunk/poisoned)
- **Mayor**: Has additional ending condition; Imp kill may redirect to another player
