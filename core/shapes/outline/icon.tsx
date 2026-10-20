import React from "react";
import { pathToSvg } from "@/core/shapes/outline/path";
import { resolveOutlineVariant } from "@/core/shapes/outline/variants";

const BOX = 24;
const INSET = 3;

/** The SVG path data of a variant's picker icon: its own outline, fitted into a 24x24 box. */
export const outlineIconPaths = (variantId: string): string[] => {
  const variant = resolveOutlineVariant(variantId);
  const { width, height } = variant.defaultSize;
  const scale = (BOX - 2 * INSET) / Math.max(width, height);
  const w = width * scale;
  const h = height * scale;
  const ox = (BOX - w) / 2;
  const oy = (BOX - h) / 2;
  const map = (x: number, y: number) => ({ x: ox + x * scale, y: oy + y * scale });
  const paths = [pathToSvg(variant.path(width, height), map)];
  if (variant.details) paths.push(pathToSvg(variant.details(width, height), map));
  return paths;
};

/** A lucide-style icon component for a variant, derived from its geometry so it cannot drift from the shape. */
export const OutlineVariantIcon: React.FC<{ variant: string; size?: number; className?: string }> = ({ variant, size = 18, className }) => (
  <svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
    {outlineIconPaths(variant).map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

export const outlineIconComponent = (variantId: string): React.FC<{ size?: number; className?: string }> => {
  const Icon: React.FC<{ size?: number; className?: string }> = (props) => <OutlineVariantIcon variant={variantId} {...props} />;
  Icon.displayName = `OutlineIcon(${variantId})`;
  return Icon;
};
