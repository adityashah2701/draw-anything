import { useOthers } from "@/liveblocks.config";
import { memo } from "react";

const COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#f59e0b", // amber-500
  "#84cc16", // lime-500
  "#10b981", // emerald-500
  "#06b6d4", // cyan-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#d946ef", // fuchsia-500
  "#f43f5e", // rose-500
];

export function Cursors() {
  const others = useOthers();

  return (
    <>
      {others.map(({ connectionId, presence, info }) => {
        if (presence?.cursor === null || presence?.cursor === undefined) {
          return null;
        }

        return (
          <Cursor
            key={connectionId}
            connectionId={connectionId}
            x={presence.cursor.x}
            y={presence.cursor.y}
            info={info}
          />
        );
      })}
    </>
  );
}

const Cursor = memo(
  ({
    connectionId,
    x,
    y,
    info,
  }: {
    connectionId: number;
    x: number;
    y: number;
    info?: any;
  }) => {
    const color = COLORS[connectionId % COLORS.length];

    return (
      <div
        className="absolute top-0 left-0 pointer-events-none z-50 flex flex-col items-start"
        style={{
          transform: `translate(${x}px, ${y}px)`,
        }}
      >
        <svg
          className="relative"
          width="24"
          height="36"
          viewBox="0 0 24 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
          />
        </svg>
        {info && (
          <div
            className="ml-4 -mt-4 px-2 py-0.5 text-white font-medium text-xs rounded-md whitespace-nowrap"
            style={{ backgroundColor: color }}
          >
            {info.name}
          </div>
        )}
      </div>
    );
  },
);

Cursor.displayName = "Cursor";
