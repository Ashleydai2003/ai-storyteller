"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/stores/roomStore";

export default function JoinRoom() {
  const router = useRouter();
  const { setRoomCode, setIsHost } = useRoomStore();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const PARTYKIT_HOST =
    process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();

    if (trimmedCode.length !== 4) {
      setError("Room code must be 4 characters");
      return;
    }

    // Check if room exists before navigating
    setChecking(true);
    setError("");
    try {
      const protocol = PARTYKIT_HOST.startsWith("localhost") ? "http" : "https";
      const res = await fetch(
        `${protocol}://${PARTYKIT_HOST}/parties/main/${trimmedCode.toLowerCase()}`
      );
      const data = await res.json();

      if (!data.exists) {
        setError("Room not found. Check the code and try again.");
        setChecking(false);
        return;
      }
    } catch {
      setError("Could not reach server. Please try again.");
      setChecking(false);
      return;
    }

    setChecking(false);
    setRoomCode(trimmedCode);
    setIsHost(false);
    router.push(`/play/${trimmedCode}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Join Room</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError("");
          }}
          placeholder="Enter room code"
          maxLength={4}
          className="w-full text-center text-3xl font-mono py-4 px-6 bg-gray-800 border border-gray-600 rounded-lg mb-4 uppercase tracking-widest"
          autoFocus
        />

        {error && <p className="text-red-500 text-center mb-4">{error}</p>}

        <button
          type="submit"
          disabled={code.length !== 4 || checking}
          className="w-full bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
        >
          {checking ? "Checking..." : "Join"}
        </button>
      </form>
    </main>
  );
}
