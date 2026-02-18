"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSwappingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PlayerSeat {
  id: string;
  name: string;
}

interface CircularSeatingProps {
  players: PlayerSeat[];
  seatingOrder: string[];
  onReorder: (newOrder: string[]) => void;
  onConfirm: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sortable seat — one player circle in the ring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SortableSeat({
  player,
  index,
  total,
  radius,
  center,
  isDragging,
}: {
  player: PlayerSeat;
  index: number;
  total: number;
  radius: number;
  center: number;
  isDragging: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortDragging,
  } = useSortable({ id: player.id });

  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  const x = center + radius * Math.cos(angle);
  const y = center + radius * Math.sin(angle);

  const style: React.CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortDragging ? 0.3 : 1,
    zIndex: isSortDragging ? 0 : 1,
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex flex-col items-center -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing select-none"
    >
      {/* Seat number badge */}
      <div className="absolute -top-1 -right-1 w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center text-[10px] font-mono text-gray-300 z-10">
        {index + 1}
      </div>
      {/* Player circle */}
      <div
        className={`
          w-16 h-16 rounded-full flex items-center justify-center
          text-lg font-bold
          border-2 transition-colors
          ${isDragging
            ? "border-red-400 bg-red-900/40"
            : "border-gray-500 bg-gray-700 hover:border-gray-400 hover:bg-gray-600"
          }
        `}
      >
        {getInitials(player.name)}
      </div>
      {/* Name label */}
      <span className="mt-1 text-xs text-gray-300 max-w-[5rem] truncate text-center">
        {player.name}
      </span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Drag overlay — the circle that follows your finger
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DragOverlayContent({ player }: { player: PlayerSeat }) {
  return (
    <div className="flex flex-col items-center select-none">
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold border-2 border-red-400 bg-red-900/60 shadow-lg shadow-red-500/20">
        {getInitials(player.name)}
      </div>
      <span className="mt-1 text-xs text-gray-200 max-w-[5rem] truncate text-center">
        {player.name}
      </span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main circular seating component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CircularSeating({
  players,
  seatingOrder,
  onReorder,
  onConfirm,
}: CircularSeatingProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sensors: pointer (mouse) + touch with a small activation distance
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Ordered player list from the seating order
  const orderedPlayers = useMemo(
    () =>
      seatingOrder
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is PlayerSeat => p !== undefined),
    [seatingOrder, players]
  );

  // Ring dimensions — responsive based on player count
  const ringSize = useMemo(() => {
    const count = orderedPlayers.length;
    if (count <= 6) return { container: 320, radius: 110 };
    if (count <= 9) return { container: 380, radius: 140 };
    if (count <= 12) return { container: 440, radius: 170 };
    return { container: 500, radius: 200 };
  }, [orderedPlayers.length]);

  const center = ringSize.container / 2;

  const activePlayer = activeId
    ? orderedPlayers.find((p) => p.id === activeId) ?? null
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = seatingOrder.indexOf(active.id as string);
      const newIndex = seatingOrder.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(seatingOrder, oldIndex, newIndex);
      onReorder(newOrder);
    },
    [seatingOrder, onReorder]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold mb-1">Arrange Seating</h1>
        <p className="text-gray-400 text-sm">
          Drag players to arrange them around the table
        </p>
      </div>

      {/* Circular ring */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={seatingOrder}
          strategy={rectSwappingStrategy}
        >
          <div
            className="relative mx-auto mb-6"
            style={{
              width: ringSize.container,
              height: ringSize.container,
            }}
          >
            {/* Decorative ring */}
            <div
              className="absolute rounded-full border border-gray-700/50 border-dashed"
              style={{
                width: ringSize.radius * 2,
                height: ringSize.radius * 2,
                left: center - ringSize.radius,
                top: center - ringSize.radius,
              }}
            />
            {/* Center label */}
            <div
              className="absolute flex items-center justify-center"
              style={{
                left: center - 30,
                top: center - 12,
                width: 60,
                height: 24,
              }}
            >
              <span className="text-gray-600 text-xs font-mono uppercase tracking-widest">
                Table
              </span>
            </div>

            {/* Player seats */}
            {orderedPlayers.map((player, index) => (
              <SortableSeat
                key={player.id}
                player={player}
                index={index}
                total={orderedPlayers.length}
                radius={ringSize.radius}
                center={center}
                isDragging={activeId === player.id}
              />
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activePlayer ? (
            <DragOverlayContent player={activePlayer} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Seating order list (compact reference) */}
      <div className="w-full max-w-xs mb-6">
        <div className="bg-gray-800/50 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-mono">
            Clockwise order
          </p>
          <div className="flex flex-wrap gap-1.5">
            {orderedPlayers.map((player, i) => (
              <span
                key={player.id}
                className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full"
              >
                {i + 1}. {player.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        className="w-full max-w-xs bg-red-700 hover:bg-red-600 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors"
      >
        Continue to Night
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
