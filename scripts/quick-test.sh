#!/bin/bash

# Quick test script - creates a game and forces it to end quickly
# Use the browser to complete a manual game quickly for testing

echo ""
echo "🎮 Quick Test Mode"
echo "=================="
echo ""
echo "This will:"
echo "1. Generate a random room code"
echo "2. Open the host interface in your browser"
echo "3. Open 5 player tabs"
echo ""
echo "Then you can quickly play through a game to test the retelling feature."
echo ""

# Generate random room code
CODE=$(LC_ALL=C tr -dc 'a-z' < /dev/urandom | head -c 4)

echo "📍 Room Code: ${CODE^^}"
echo ""

# Open host
echo "Opening host interface..."
open "http://localhost:3000/room/$CODE"
sleep 2

# Open player tabs
echo "Opening player tabs..."
for name in Alice Bob Charlie Diana Eve; do
  open "http://localhost:3000/play/$CODE"
  sleep 0.5
done

echo ""
echo "✅ Ready to test!"
echo ""
echo "Now:"
echo "1. In the host tab, start the game"
echo "2. Play through quickly (auto-advance nights, vote quickly)"
echo "3. When game ends, you'll see the retelling with AI (if API key is set)"
echo ""
echo "💡 Check PartyKit logs for debug output about AI generation"
echo ""
