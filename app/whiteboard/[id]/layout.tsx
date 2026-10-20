import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo/metadata";

// The page is a client component, so the segment's metadata lives here.
export const metadata: Metadata = privatePageMetadata("Whiteboard");

export default function WhiteboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
