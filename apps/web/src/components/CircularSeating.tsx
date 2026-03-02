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
import {
  computeRingSize,
  computeSeatPosition,
  getInitials,
} from "@/lib/circularLayout";
import CharacterSelection from "./CharacterSelection";
import type { Character } from "@ai-botc/game-logic";

interface PlayerSeat {
  id: string;
  name: string;
}

interface CircularSeatingProps {
  players: PlayerSeat[];
  seatingOrder: string[];
  selectedCharacters: Character[];
  onReorder: (newOrder: string[]) => void;
  onToggleCharacter: (character: Character) => void;
  onConfirm: () => void;
}

/** Single draggable player seat in the circular arrangement */
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

  const { x, y } = computeSeatPosition(index, total, radius, center);

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

/** Floating overlay that follows the user's finger/cursor during drag */
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

/**
 * Drag-and-drop seating arrangement for host setup.
 * Players can be dragged to swap positions in the circle.
 * Includes character selection panel.
 */
export default function CircularSeating({
  players,
  seatingOrder,
  selectedCharacters,
  onReorder,
  onToggleCharacter,
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

  const ringSize = useMemo(
    () => computeRingSize(orderedPlayers.length),
    [orderedPlayers.length]
  );

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
    <div className="flex flex-col items-center w-full max-w-6xl">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold mb-1">Setup Game</h1>
        <p className="text-gray-400 text-sm">
          Select characters and arrange seating
        </p>
      </div>

      {/* Two-column layout: Character selection on left, seating on right */}
      <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
        {/* Character Selection Panel */}
        <div className="flex-1 lg:max-w-md w-full">
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 text-gray-300">
              Select Characters (Optional)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Choose specific characters to include. Remaining slots will be filled randomly.
            </p>
            <CharacterSelection
              playerCount={players.length}
              selectedCharacters={selectedCharacters}
              onToggle={onToggleCharacter}
            />
          </div>
        </div>

        {/* Seating Arrangement */}
        <div className="flex-1 flex flex-col items-center w-full">
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
            Finish Setup
          </button>
        </div>
      </div>
    </div>
  );
}
