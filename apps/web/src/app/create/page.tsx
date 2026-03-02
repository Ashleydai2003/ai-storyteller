"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateRoomCode } from "@ai-botc/game-logic";
import { useRoomStore } from "@/stores/roomStore";

export default function CreateRoom() {
  const router = useRouter();
  const { setRoomCode, setIsHost } = useRoomStore();
  const [mode, setMode] = useState<"select" | "storyteller" | "helper">("select");

  const handleAIStoryteller = () => {
    // Generate a new room code and redirect to the room
    const code = generateRoomCode();
    setRoomCode(code);
    setIsHost(true);
    router.replace(`/room/${code}`);
  };

  const handleStoryHelper = () => {
    setMode("helper");
  };

  // Coming soon screen for Story Helper
  if (mode === "helper") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold mb-4">Story Helper</h1>
          <p className="text-2xl text-gray-400 mb-8">Coming Soon...</p>
          <button
            onClick={() => setMode("select")}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  // Selection screen
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2">Create Room</h1>
        <p className="text-xl text-gray-400">Choose your mode</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={handleAIStoryteller}
          className="bg-red-700 hover:bg-red-600 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
        >
          AI Storyteller
        </button>
        <button
          onClick={handleStoryHelper}
          className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
        >
          Story Helper
        </button>
        <button
          onClick={() => router.back()}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 px-6 rounded-lg transition-colors mt-4"
        >
          Back
        </button>
      </div>
    </main>
  );
}
