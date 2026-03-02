# Endpoint Tests - Retelling & Grimoire

## Summary

Fixed "failed to fetch" errors for retelling and grimoire endpoints.

**Root Cause**: PartyKit bundler was failing due to `.js` extensions in TypeScript import statements in the `@ai-botc/ai-storyteller` package.

**Fix Applied**:
1. Removed `.js` extensions from imports in ai-storyteller package
2. Updated frontend to use correct PartyKit URL format: `/parties/main/${code}`

## Test Results

All tests passing ✅

### Test Scripts

Run these scripts to verify the endpoints are working:

```bash
# Basic endpoint test
./test-endpoints.sh pwd5

# Comprehensive game flow test
./test-game-flow.sh

# Frontend URL format test
./test-frontend-urls.sh
```

### Manual Testing

```bash
# Test grimoire endpoint (game must be ended)
curl http://localhost:1999/parties/main/pwd5?grimoire=true | jq .

# Test retelling endpoint (game must be ended)
curl http://localhost:1999/parties/main/pwd5?retelling=true | jq .

# Test error handling (active game)
curl http://localhost:1999/parties/main/x5cq?grimoire=true | jq .
# Expected: {"error": "Game has not ended yet"}
```

## Changes Made

### 1. Fixed PartyKit Build Issues

**Files Modified**:
- `/packages/ai-storyteller/src/index.ts`
- `/packages/ai-storyteller/src/client.ts`
- `/packages/ai-storyteller/src/retelling.ts`

**Change**: Removed `.js` file extensions from import statements
```typescript
// Before
import { createClient } from "./client.js";

// After
import { createClient } from "./client";
```

### 2. Updated Frontend URL Format

**File Modified**: `/apps/web/src/app/room/[code]/page.tsx`

**Change**: Updated fetch URLs to use correct PartyKit path
```typescript
// Before
const retellingUrl = `${protocol}://${partyHost}/party/${code}?retelling=true`;
const grimoireUrl = `${protocol}://${partyHost}/party/${code}?grimoire=true`;

// After
const retellingUrl = `${protocol}://${partyHost}/parties/main/${code}?retelling=true`;
const grimoireUrl = `${protocol}://${partyHost}/parties/main/${code}?grimoire=true`;
```

## Endpoint Specifications

### GET /parties/main/:code?grimoire=true

Returns the final grimoire for an ended game.

**Response** (Success - 200):
```json
[
  {
    "playerId": "uuid",
    "playerName": "Alice",
    "character": "virgin",
    "characterType": "townsfolk",
    "states": [],
    "alive": false,
    "reminderTokens": ["virgin-no-ability"]
  },
  ...
]
```

**Response** (Error - 400):
```json
{
  "error": "Game has not ended yet"
}
```

### GET /parties/main/:code?retelling=true

Returns an AI-generated narrative retelling of an ended game.

**Response** (Success - 200):
```json
{
  "narrative": "After 4 tense rounds, Good triumphed...",
  "highlights": [
    "Good triumphed after 4 rounds",
    "No execution with 3 players — the Mayor wins for Good!"
  ],
  "notablePlays": [
    "Player X made a crucial deduction",
    "Player Y's bluff was masterful"
  ]
}
```

**Response** (Error - 400):
```json
{
  "error": "Game has not ended yet"
}
```

## Verification

1. ✅ PartyKit server starts without build errors
2. ✅ Grimoire endpoint returns correct data for ended games
3. ✅ Retelling endpoint returns correct data for ended games
4. ✅ Both endpoints reject non-ended games with proper error
5. ✅ Response structures match expected format
6. ✅ Frontend URLs updated to correct format
7. ✅ All test scripts pass

## Notes

- Both `/party/` and `/parties/main/` paths work due to PartyKit routing
- `/parties/main/` is the canonical correct format
- Endpoints only work for games with `phase === "ended"`
- Retelling uses AI (Anthropic or OpenAI) if API key is configured, otherwise falls back to template
