"use client";

import { useEffect, useState } from "react";

export interface Announcement {
  id: string;
  text: string;
  type: "nomination" | "death" | "slayer" | "virgin" | "vote" | "info";
}

interface AnnouncementToastProps {
  announcements: Announcement[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<Announcement["type"], { bg: string; border: string; icon: string }> = {
  nomination: { bg: "bg-yellow-900/80", border: "border-yellow-600", icon: "🗳️" },
  death: { bg: "bg-red-900/80", border: "border-red-600", icon: "💀" },
  slayer: { bg: "bg-purple-900/80", border: "border-purple-600", icon: "🗡️" },
  virgin: { bg: "bg-pink-900/80", border: "border-pink-600", icon: "⚔️" },
  vote: { bg: "bg-blue-900/80", border: "border-blue-600", icon: "✓" },
  info: { bg: "bg-gray-800/80", border: "border-gray-600", icon: "📢" },
};

/**
 * Toast notifications for day events shown on the host screen.
 * Auto-dismisses after a few seconds.
 */
export default function AnnouncementToast({ announcements, onDismiss }: AnnouncementToastProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {announcements.map((announcement) => (
        <ToastItem key={announcement.id} announcement={announcement} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss: (id: string) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const style = TYPE_STYLES[announcement.type];

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(announcement.id), 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [announcement.id, onDismiss]);

  return (
    <div
      className={`
        ${style.bg} ${style.border} border rounded-lg px-4 py-3 shadow-lg
        flex items-start gap-3 transition-all duration-300 ease-out
        ${isVisible && !isExiting ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}
      `}
      onClick={() => {
        setIsExiting(true);
        setTimeout(() => onDismiss(announcement.id), 300);
      }}
    >
      <span className="text-xl flex-shrink-0">{style.icon}</span>
      <p className="text-white text-sm font-medium leading-snug">{announcement.text}</p>
    </div>
  );
}
