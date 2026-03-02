"use client";

import { useEffect, useRef, useState } from "react";
import { useMiniGameStore } from "@/stores/miniGameStore";

interface Obstacle {
  id: number;
  x: number;
  width: number;
  height: number;
  passed: boolean;
}

/**
 * Simple Chrome Dino game - tap/space to jump over obstacles.
 */
export default function DinoGame() {
  const { gameState, updateScore } = useMiniGameStore();
  const [dinoY, setDinoY] = useState(0);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const velocityRef = useRef(0);
  const nextObstacleTimeRef = useRef(0);
  const nextIdRef = useRef(0);
  const animationRef = useRef<number | undefined>();

  const GRAVITY = 0.6;
  const JUMP_FORCE = -12;
  const GROUND = 0;
  const DINO_SIZE = 40;
  const SCROLL_SPEED = 4;

  // Jump handler
  const jump = () => {
    if (gameState !== "running" || gameOver) return;
    if (dinoY === GROUND) {
      velocityRef.current = JUMP_FORCE;
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gameState, gameOver, dinoY]);

  // Game loop
  useEffect(() => {
    if (gameState !== "running" || gameOver) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const loop = () => {
      const now = Date.now();

      // Update dino physics
      velocityRef.current += GRAVITY;
      setDinoY((y) => {
        const newY = y + velocityRef.current;
        if (newY >= GROUND) {
          velocityRef.current = 0;
          return GROUND;
        }
        return newY;
      });

      // Update obstacles
      setObstacles((prev) => {
        const updated = prev
          .map((o) => ({ ...o, x: o.x - SCROLL_SPEED }))
          .filter((o) => o.x > -o.width);

        // Check for passed obstacles and update score
        updated.forEach((o) => {
          if (!o.passed && o.x + o.width < 100) {
            o.passed = true;
            setScore((s) => s + 1);
          }
        });

        return updated;
      });

      // Spawn new obstacle
      if (now > nextObstacleTimeRef.current) {
        const newObstacle: Obstacle = {
          id: nextIdRef.current++,
          x: window.innerWidth,
          width: 20 + Math.random() * 30,
          height: 30 + Math.random() * 40,
          passed: false,
        };
        setObstacles((prev) => [...prev, newObstacle]);
        nextObstacleTimeRef.current = now + 1200 + Math.random() * 800;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, gameOver]);

  // Check collision
  useEffect(() => {
    if (gameOver) return;

    for (const obs of obstacles) {
      if (obs.x < 100 + DINO_SIZE && obs.x + obs.width > 100) {
        if (dinoY < obs.height) {
          setGameOver(true);
          return;
        }
      }
    }
  }, [obstacles, dinoY, gameOver]);

  // Sync score
  useEffect(() => {
    updateScore(score);
  }, [score, updateScore]);

  // Reset on restart
  useEffect(() => {
    if (gameState === "running" && gameOver) {
      setGameOver(false);
      setScore(0);
      setDinoY(0);
      setObstacles([]);
      velocityRef.current = 0;
      nextObstacleTimeRef.current = Date.now() + 1500;
      nextIdRef.current = 0;
    }
  }, [gameState, gameOver]);

  return (
    <div
      className="relative w-full h-full bg-gray-900"
      onClick={jump}
      onTouchStart={(e) => {
        e.preventDefault();
        jump();
      }}
    >
      {/* Ground */}
      <div className="absolute bottom-20 left-0 right-0 h-0.5 bg-gray-600" />

      {/* Dino */}
      <div
        className="absolute bg-green-500 rounded"
        style={{
          width: DINO_SIZE,
          height: DINO_SIZE,
          left: 100,
          bottom: 80 + dinoY,
        }}
      />

      {/* Obstacles */}
      {obstacles.map((obs) => (
        <div
          key={obs.id}
          className="absolute bg-red-500 rounded"
          style={{
            width: obs.width,
            height: obs.height,
            left: obs.x,
            bottom: 80,
          }}
        />
      ))}

      {/* Game over */}
      {gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <p className="text-white text-4xl font-bold mb-2">Game Over</p>
            <p className="text-gray-300 text-xl">Score: {score}</p>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!gameOver && obstacles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-400 text-lg">Tap or press Space to jump</p>
        </div>
      )}
    </div>
  );
}
