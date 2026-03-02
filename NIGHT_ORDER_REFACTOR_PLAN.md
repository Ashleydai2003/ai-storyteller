# Night Order Refactor Plan

## Goal
Simplify the night order system to be character-based (static) with dynamic state checks, eliminating the complex pre-computed player-based approach.

## Current Problems
1. Night orders are pre-computed with player IDs at game start
2. Complex filtering logic tries to handle starpass, ravenkeeper, etc. with player-based steps
3. Brittle system that breaks when players change characters (starpass)
4. Ravenkeeper doesn't work because nightDeaths is empty when steps are generated

## New Architecture

### Static Night Order (Character-Based)
- Use `FIRST_NIGHT_ORDER` and `OTHER_NIGHT_ORDER` constants directly
- No pre-computation at game start
- No `NightStep[]` arrays stored in `ServerGameState`

### Dynamic Resolution (State-Based)
At night execution time:
1. Get the night order (array of character strings)
2. For each character in order:
   - Resolve which player(s) have that character RIGHT NOW
   - Check game state to see if they should wake
   - Wake them if conditions are met
   - Execute their handler
3. Move to next character in order

### State Updates During Night
- When Imp kills, immediately update `serverGameState.nightDeaths` array
- When Ravenkeeper's turn comes, check if they're in `nightDeaths` → wake them
- When minion becomes Imp via starpass, update their character fields
- Next handler checks current character, not pre-computed template

## Implementation Steps

### Step 1: Update Types
- [x] Remove `firstNightOrder` and `otherNightsOrder` from `ServerGameState`
- [x] Remove `nightSteps` from `ServerGameState`
- [x] Remove `currentNightStepIndex` from `ServerGameState`
- [x] Add `currentNightHandlerIndex` (number - index in character order)
- [x] Add `currentNightHandler` (string - character name)

### Step 2: Refactor nightSteps.ts
- [ ] Remove `buildNightOrders()` function
- [ ] Remove `generateNightSteps()` function
- [ ] Remove `NightStep` type usage
- [ ] Create `resolveHandler(handler: string, state, serverState): Player[] | null`
  - Returns the player(s) who should wake for this handler
  - Returns null if handler should be skipped
  - Handles all special cases (minion_info, demon_info, imp, ravenkeeper, undertaker, etc.)
- [ ] Update `dispatchNightStep()` to accept `(handler: string, player: Player)` instead of `NightStep`
- [ ] Update `dispatchNightAction()` to accept `(handler: string, player: Player)` instead of `NightStep`
- [ ] Update all handler functions to not need `NightStep` parameter

### Step 3: Refactor room.ts Night Execution
- [ ] Remove `buildNightOrders()` call from character assignment
- [ ] Remove `generateNightSteps()` call from `startNight()`
- [ ] Rewrite `startNight()` to:
  ```typescript
  async startNight() {
    const nightOrder = getNightOrder(this.state.roundNumber ?? 1);
    this.serverGameState.currentNightHandlerIndex = 0;
    this.serverGameState.nightDeaths = [];
    await this.executeNextNightHandler();
  }
  ```
- [ ] Rewrite `executeNextNightHandler()` to:
  ```typescript
  async executeNextNightHandler() {
    const nightOrder = getNightOrder(this.state.roundNumber ?? 1);
    const index = this.serverGameState.currentNightHandlerIndex ?? 0;

    if (index >= nightOrder.length) {
      await this.endNight();
      return;
    }

    const handler = nightOrder[index];
    const players = resolveHandler(handler, this.state, this.serverGameState);

    if (!players || players.length === 0) {
      // Skip this handler, move to next
      this.serverGameState.currentNightHandlerIndex = index + 1;
      await this.executeNextNightHandler();
      return;
    }

    // For handlers that affect multiple players (minion_info, demon_info)
    // we need to handle them one at a time or all at once
    // For now, wake the first player
    const player = players[0];
    this.awakePlayerId = player.id;
    const prompted = await dispatchNightStep(ctx, handler, player);

    if (!prompted) {
      // Unknown handler, skip
      this.awakePlayerId = null;
      this.serverGameState.currentNightHandlerIndex = index + 1;
      await this.executeNextNightHandler();
    }
  }
  ```
- [ ] Update `handlePlayerAcknowledge()` to advance to next handler
- [ ] Update `handlePlayerNightAction()` to work with handler strings

### Step 4: Special Handler Logic in resolveHandler()

#### minion_info
```typescript
if (handler === "minion_info") {
  if (state.players.length < 7) return null;
  const minions = state.players.filter(p => p.characterType === "minion" && p.alive);
  return minions.length > 0 ? minions : null;
}
```

#### demon_info
```typescript
if (handler === "demon_info") {
  if (state.players.length < 7) return null;
  const demons = state.players.filter(p => p.characterType === "demon" && p.alive);
  return demons.length > 0 ? demons : null;
}
```

#### imp (handles starpass)
```typescript
if (handler === "imp") {
  // Find whoever has demon REGISTRATION (not type, because of starpass)
  const demon = state.players.find(p => p.characterRegistration === "demon" && p.alive);
  return demon ? [demon] : null;
}
```

#### ravenkeeper (state-based)
```typescript
if (handler === "ravenkeeper") {
  // Find ravenkeepers who died tonight
  const deadRKs = state.players.filter(p =>
    p.character === "ravenkeeper" &&
    serverState.nightDeaths?.includes(p.name)
  );
  return deadRKs.length > 0 ? deadRKs : null;
}
```

#### undertaker (state-based)
```typescript
if (handler === "undertaker") {
  const nightNumber = state.roundNumber ?? 1;
  if (nightNumber === 1) return null; // Not on first night
  if (!serverState.lastExecutedCharacter) return null; // No execution yesterday

  const undertaker = state.players.find(p => p.character === "undertaker" && p.alive);
  return undertaker ? [undertaker] : null;
}
```

#### Default (normal characters)
```typescript
// For regular characters, find alive player with this character
const player = state.players.find(p => p.character === handler && p.alive);
return player ? [player] : null;
```

### Step 5: Update Imp Kill Handler
In `resolveNight_imp()`:
```typescript
// When Imp kills someone
if (targetId) {
  // ... existing kill logic ...

  // Immediately add to nightDeaths
  if (!ctx.serverGameState.nightDeaths) {
    ctx.serverGameState.nightDeaths = [];
  }
  ctx.serverGameState.nightDeaths.push(target.name);
  await ctx.persistServerState();

  // No need to insert Ravenkeeper steps - they'll be picked up
  // naturally when we reach "ravenkeeper" in the night order
}
```

### Step 6: Handle Multiple Players for Same Handler
For `minion_info` and `demon_info`, we need to wake multiple players. Options:
1. Wake them sequentially (one at a time)
2. Wake them all simultaneously
3. Use a sub-index to track which minion we're on

Recommendation: Wake sequentially. Add `currentHandlerPlayerIndex` to track which player we're waking within a handler that has multiple players.

## Benefits of New System
1. **Simple**: Night order is just an array of character names
2. **Dynamic**: Everything resolved at runtime based on current game state
3. **Robust**: Handles starpass naturally (check current character, not pre-computed)
4. **State-based**: Ravenkeeper works because we check nightDeaths when we reach them in order
5. **Easy to debug**: Clear execution flow, no complex filtering logic

## Testing Plan
After implementation:
1. Test normal night (no special cases)
2. Test Ravenkeeper wake after Imp kill
3. Test starpass (minion becomes Imp, shouldn't get old ability)
4. Test Undertaker (only wakes if execution happened)
5. Test minion/demon info with < 7 players (should skip)
6. Test multiple minions/demons (sequential wake)
