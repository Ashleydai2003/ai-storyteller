import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-8 text-center">
        Blood on the Clocktower
      </h1>
      <p className="text-xl text-gray-400 mb-12 text-center">
        AI-Powered Storyteller
      </p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/create"
          className="bg-red-700 hover:bg-red-600 text-white font-bold py-4 px-8 rounded-lg text-center text-xl transition-colors"
        >
          Create Room
        </Link>
        <Link
          href="/join"
          className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 px-8 rounded-lg text-center text-xl transition-colors"
        >
          Join Room
        </Link>
      </div>
    </main>
  );
}
