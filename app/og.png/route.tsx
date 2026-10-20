import { ImageResponse } from "next/og";
import { BRAND_COLORS, LOCKUP_VIEWBOX, MARK_PATH, WORDMARK_PATH } from "@/lib/brand";
import { OG_IMAGE_SIZE } from "@/lib/seo/site";

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: BRAND_COLORS.paper,
          color: BRAND_COLORS.text,
        }}
      >
        {/* The lockup comes from lib/brand.ts, so the preview follows the brand without edits here. */}
        <svg viewBox={LOCKUP_VIEWBOX} width={332} height={64}>
          <path d={MARK_PATH} fill={BRAND_COLORS.ink} />
          <path d={WORDMARK_PATH} fill={BRAND_COLORS.text} />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#5b6270" }}>
            AI whiteboard for diagrams
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 88, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3 }}>
            <span>Describe it.</span>
            <span>Watch it get drawn.</span>
          </div>
        </div>
        <div style={{ height: 4, width: 160, background: BRAND_COLORS.ink }} />
      </div>
    ),
    { ...OG_IMAGE_SIZE },
  );
}
