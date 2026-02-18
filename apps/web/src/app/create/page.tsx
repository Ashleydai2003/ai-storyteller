"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateRoomCode } from "@ai-botc/game-logic";
import { useRoomStore } from "@/stores/roomStore";

export default function CreateRoom() {
  const router = useRouter();
  const { setRoomCode, setIsHost } = useRoomStore();

  useEffect(() => {
    // Generate a new room code and redirect to the room
    const code = generateRoomCode();
    setRoomCode(code);
    setIsHost(true);
    router.replace(`/room/${code}`);
  }, [router, setRoomCode, setIsHost]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <p className="text-xl">Creating room...</p>
    </main>
  );
}
