import React from "react";

export interface TextFormat {
  bold: boolean;
  italic: boolean;
  heading: "none" | "h1" | "h2" | "h3";
  size: number;
}

const H_LABELS = { none: "¶", h1: "H1", h2: "H2", h3: "H3" } as const;
const HEADINGS: TextFormat["heading"][] = ["none", "h1", "h2", "h3"];

export function TextToolbar({
  fmt,
  ax,
  ay,
  onBold,
  onItalic,
  onHeading,
  onSize,
}: {
  fmt: TextFormat;
  ax: number;
  ay: number;
  onBold: () => void;
  onItalic: () => void;
  onHeading: (h: TextFormat["heading"]) => void;
  onSize: (d: number) => void;
}) {
  return (
    <div
      className="ctb-bar"
      onMouseDown={(e) => e.preventDefault()} // keep editor focused
      style={{
        position: "fixed",
        top: ay - 52,
        left: ax,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px 6px",
        background: "rgba(24,24,27,0.8)",
        backdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        boxShadow: "0 4px 15px rgba(0,0,0,0.25)",
        userSelect: "none",
        animation: "ctb-bar 0.12s cubic-bezier(.16,1,.3,1) forwards",
      }}
    >
      <Btn active={fmt.bold} fw="bold" onClick={onBold}>
        B
      </Btn>
      <Btn active={fmt.italic} fi="italic" onClick={onItalic}>
        I
      </Btn>
      <Sep />
      {HEADINGS.map((h) => (
        <Btn
          key={h}
          active={fmt.heading === h}
          fw="600"
          fs={h === "none" ? 15 : 11}
          w={h === "none" ? 24 : 30}
          onClick={() => onHeading(h)}
        >
          {H_LABELS[h]}
        </Btn>
      ))}
      <Sep />
      <Btn active={false} fs={11} w={28} onClick={() => onSize(-2)}>
        A−
      </Btn>
      <span
        style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: 10,
          width: 22,
          textAlign: "center",
          fontFamily: "monospace",
        }}
      >
        {fmt.size}
      </span>
      <Btn active={false} fs={11} w={28} onClick={() => onSize(2)}>
        A+
      </Btn>
    </div>
  );
}

function Btn({
  active,
  fw,
  fi,
  fs = 13,
  w = 28,
  onClick,
  children,
}: {
  active: boolean;
  fw?: string;
  fi?: string;
  fs?: number;
  w?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        background: active ? "rgba(255,255,255,0.18)" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: w,
        height: 28,
        fontSize: fs,
        fontFamily: "system-ui,sans-serif",
        fontWeight: fw,
        fontStyle: fi,
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: "rgba(255,255,255,0.13)",
        margin: "0 4px",
      }}
    />
  );
}
