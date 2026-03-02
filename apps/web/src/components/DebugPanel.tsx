"use client";

import { useState, useEffect, useRef } from "react";

export interface DebugLog {
  id: string;
  level: "log" | "info" | "warn" | "error";
  message: string;
  data?: unknown;
  timestamp: string;
}

interface DebugPanelProps {
  logs: DebugLog[];
  onClear: () => void;
}

/**
 * Debug panel that displays server logs in the web viewer.
 * Appears as a collapsible panel at the bottom of the screen.
 */
export default function DebugPanel({ logs, onClear }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3
      });
    } catch {
      return timestamp;
    }
  };

  const getLevelColor = (level: DebugLog["level"]) => {
    switch (level) {
      case "error":
        return "text-red-400 bg-red-950/50 border-red-800";
      case "warn":
        return "text-yellow-400 bg-yellow-950/50 border-yellow-800";
      case "info":
        return "text-blue-400 bg-blue-950/50 border-blue-800";
      default:
        return "text-gray-300 bg-gray-900/50 border-gray-700";
    }
  };

  const getLevelBadgeColor = (level: DebugLog["level"]) => {
    switch (level) {
      case "error":
        return "bg-red-700 text-red-100";
      case "warn":
        return "bg-yellow-700 text-yellow-100";
      case "info":
        return "bg-blue-700 text-blue-100";
      default:
        return "bg-gray-700 text-gray-100";
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col max-h-[60vh] bg-gray-950 border-t-2 border-gray-800 shadow-2xl">
      {/* Header */}
      <div className="w-full px-4 py-2 bg-gray-900 flex items-center justify-between text-sm font-mono">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 hover:text-gray-100 transition-colors"
        >
          <span className="text-gray-400">▸</span>
          <span className="text-gray-300 font-semibold">Debug Logs</span>
          <span className="text-gray-500">({logs.length})</span>
          <span
            className={`transform transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
        </button>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={onClear}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              autoScroll
                ? "bg-green-700 hover:bg-green-600"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        </div>
      </div>

      {/* Logs */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No debug logs yet
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`border-l-4 px-3 py-2 rounded ${getLevelColor(log.level)}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${getLevelBadgeColor(log.level)}`}
                  >
                    {log.level}
                  </span>
                  <span className="text-gray-500 tabular-nums">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className="flex-1">{log.message}</span>
                </div>
                {log.data !== undefined && (
                  <pre className="mt-1 ml-16 text-[11px] text-gray-400 overflow-x-auto">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}
