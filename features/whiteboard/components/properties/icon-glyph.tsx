import { categoryTint, type IconDef } from "@/core/icons/registry";

/** An icon as inline SVG for panels and pickers; the canvas draws its own (core/icons/draw.ts). */
export const IconGlyph = ({ icon, size = 28 }: { icon: IconDef; size?: number }) => {
  const logo = icon.style === "logo";
  const color = icon.color ?? categoryTint(icon.category);
  const svg = (
    <svg
      viewBox={`0 0 ${icon.viewBox.width} ${icon.viewBox.height}`}
      width={logo ? Math.round(size * 0.786) : size}
      height={logo ? Math.round(size * 0.786) : size}
      fill={logo ? color : "none"}
      stroke={logo ? "none" : color}
      strokeWidth={icon.strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icon.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
  // Brand marks keep their own colours, so they sit on the same white tile the canvas draws them on.
  return logo ? <span className="rounded-md bg-white p-1">{svg}</span> : svg;
};
