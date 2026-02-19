# AI Blood on the Clocktower (BOTC)

A real-time multiplayer web implementation of **Blood on the Clocktower** — a social deduction game where players must work together to identify and eliminate the demon before evil wins. This project provides a Kahoot-style interface where players join rooms via codes, with a host screen for game management and individual player screens for private information and actions.

## 🎮 Overview

This is a full-stack implementation of Blood on the Clocktower (Trouble Brewing edition) featuring:

- **No authentication required** — players join with a room code and name
- **Real-time synchronization** — WebSocket-based state management
- **Host-controlled gameplay** — storyteller manages game flow
- **Private player screens** — each player sees only their own information
- **Persistent game state** — reconnection support with stable client tokens
- **Comprehensive game logging** — detailed logs for debugging and game analysis

## 🏗️ Architecture

This is a **monorepo** managed with **pnpm** and **Turborepo**, consisting of three main packages:

### Packages

1. **`apps/web`** — Next.js 15 frontend application
   - App Router architecture
   - Zustand for client-side state management
   - Tailwind CSS for styling
   - Real-time WebSocket communication via PartySocket

2. **`party`** — PartyKit server (Cloudflare Workers)
   - WebSocket server for real-time game state
   - Durable Objects for persistent room state
   - Game logic orchestration (night/day phases, voting, etc.)
   - Comprehensive game logging system

3. **`packages/game-logic`** — Shared TypeScript game logic
   - Character definitions and types
   - Character bag generation
   - Demon bluff generation
   - Type definitions shared across frontend and backend

### Key Design Decisions

- **Stable Client Tokens**: Players use a UUID stored in `sessionStorage` as their identity, separate from ephemeral WebSocket connections. This enables robust reconnection without losing game state.
- **Deterministic Game Logic**: All game mechanics are deterministic; randomness is only used for character selection, bluffs, and drunk/poisoned misinformation.
- **Host Information Control**: The host screen shows minimal information during the night phase (only notifications when phases end), maintaining the game's integrity.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **State Management**: Zustand
- **Real-time**: PartyKit (Cloudflare Workers + Durable Objects)
- **UI Libraries**: `@dnd-kit` for drag-and-drop interactions
- **Build System**: Turborepo, pnpm
- **Package Manager**: pnpm 9.15.0

## 📁 Project Structure

```
ai-botc/
├── apps/
│   └── web/                    # Next.js frontend
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   │   ├── create/    # Room creation page
│       │   │   ├── join/       # Room joining page
│       │   │   ├── room/       # Host screen
│       │   │   └── play/       # Player screen
│       │   ├── components/    # React components
│       │   ├── hooks/          # Custom React hooks
│       │   └── stores/         # Zustand stores
│       └── package.json
├── party/                      # PartyKit server
│   ├── src/
│   │   ├── room.ts            # Main server logic
│   │   ├── nightSteps.ts      # Night phase handlers
│   │   ├── dayPhase.ts        # Day phase helpers
│   │   └── gameLog.ts         # Logging system
│   └── partykit.json
├── packages/
│   └── game-logic/            # Shared game logic
│       └── src/
│           ├── characters.ts  # Character definitions
│           ├── types/         # TypeScript types
│           └── index.ts       # Exports
├── package.json               # Root package.json
├── turbo.json                 # Turborepo config
└── pnpm-workspace.yaml        # pnpm workspace config
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** 9.15.0 (or install via `npm install -g pnpm@9.15.0`)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-botc
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up PartyKit** (if deploying)
   ```bash
   cd party
   npx partykit login
   ```

### Development

Run all services in development mode:

```bash
pnpm dev:all
```

This starts:
- **Frontend**: `http://localhost:3000`
- **PartyKit Server**: `http://localhost:1999`

Or run services individually:

```bash
# Frontend only
pnpm dev:web

# PartyKit server only
pnpm dev:party
```

### Building

Build all packages:

```bash
pnpm build
```

### Type Checking

Type-check all packages:

```bash
pnpm type-check
```

## 🎯 Game Flow

### 1. Room Creation & Joining

- **Host**: Navigate to `/create` to generate a room code
- **Players**: Navigate to `/join` and enter the room code
- Players enter their name and join the waiting room
- Host can see all players and start the game when 6+ players are present

### 2. Game Setup

- Character bag is generated based on player count
- Characters are assigned to players
- Host reviews and arranges seating (drag-and-drop circular interface)
- Demon bluffs are generated (3 characters not in play)
- Game transitions to Night 1

### 3. Night Phase

Players are woken up sequentially according to the night order:

- **Information prompts**: Players see information (e.g., "The Demon is X", "These characters are not in play")
- **Action prompts**: Players make choices (e.g., select someone to kill, select two people)
- **Drunk/Poisoned**: Players receive false information if affected
- **Spy**: Sees the full grimoire (all character assignments)

All actions are logged and state updates immediately.

### 4. Day Phase

- **Dawn Announcement**: Cinematic fade-in showing who died (or "no one")
- **Discussion Timer**: 5-minute timer for discussion
- **Nominations**: Players can nominate others (once per day)
- **Accusation Phase**: 5-minute timer for accusation/defense
- **Voting**: Sequential voting in seating order
- **Execution**: Players on the block are executed (or tied vote = no execution)
- **Dusk Announcement**: Cinematic fade-in showing execution results

### 5. Game End Conditions

The game ends when:

- **Good wins**: The Demon is slain (executed or slayed)
- **Evil wins**: 
  - Only 2 players remain and the Demon is one of them
  - The Saint is executed (and not drunk/poisoned)
- **Scarlet Woman intercept**: If the Imp dies and a Scarlet Woman is alive (≥5 players), she becomes the new Imp and the game continues

## 🎭 Implemented Characters

### Townsfolk
- Washerwoman
- Librarian
- Investigator
- Chef
- Empath
- Fortune Teller
- Undertaker
- Monk
- Virgin
- Slayer
- Soldier
- Mayor

### Outsiders
- Butler
- Drunk (secret identity)
- Recluse
- Saint

### Minions
- Poisoner
- Spy
- Scarlet Woman
- Baron

### Demons
- Imp

## 🔧 Key Features

### Real-time Synchronization
- WebSocket-based state updates
- Automatic reconnection with state recovery
- Stable client tokens prevent identity loss on refresh

### Game State Management
- Persistent room state in PartyKit Durable Objects
- Comprehensive game logging (stored and console output)
- HTTP endpoint for retrieving game logs: `GET /parties/main/{roomCode}?log=true`

### UI/UX
- **Circular Seating Arrangement**: Drag-and-drop interface for arranging players
- **Circular Player Selection**: Visual selection interface for night actions
- **Circular Grimoire**: Spy's view of all character assignments
- **Cinematic Announcements**: Fade-in animations for dawn/dusk with sound effects
- **Responsive Design**: Works on desktop (host) and mobile (players)

### Special Abilities

- **Imp Starpass**: If the Imp kills themselves, a random minion becomes the new Imp
- **Scarlet Woman Intercept**: If the Imp dies and Scarlet Woman is alive (≥5 players), she becomes the Imp
- **Virgin Ability**: If nominated by a Townsfolk, the nominator dies immediately
- **Monk Protection**: Selects a player to protect from night kills
- **Soldier Immunity**: Permanent protection (unless drunk/poisoned)
- **Slayer Ability**: Can slay a player once per game (kills if target is the Demon)
- **Mayor Bounce**: Imp's kill may bounce off the Mayor to a random player
- **Undertaker**: Learns the executed player's character on subsequent nights

## 📝 Game Logging

All game events are logged to:
1. **Durable Storage**: Persistent logs stored in PartyKit
2. **Server Console**: Human-readable output for debugging

Logs include:
- Room creation and player joins
- Character bag generation and assignments
- Night actions and information prompts
- Day phase events (nominations, votes, executions)
- Game end conditions

Retrieve logs via HTTP:
```bash
curl "http://localhost:1999/parties/main/{roomCode}?log=true"
```

## 🚢 Deployment

### Frontend (Vercel)

```bash
cd apps/web
pnpm build
# Deploy to Vercel (connect GitHub repo or use Vercel CLI)
```

### PartyKit Server

```bash
cd party
pnpm deploy
```

Update the frontend's PartyKit connection URL in production to point to your deployed PartyKit server.
