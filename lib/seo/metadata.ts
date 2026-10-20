import type { Metadata } from "next";
import { getSiteUrl, OG_IMAGE_ALT, OG_IMAGE_PATH, OG_IMAGE_SIZE, SITE_NAME } from "./site";

interface PublicPageInput {
  /** Used verbatim, so it must already be unique and descriptive. */
  title: string;
  description: string;
  /** Canonical path of the page, e.g. "/" (no query string, no trailing slash except the root). */
  path: string;
}

/**
 * Metadata for an indexable public page: title, description, canonical, Open Graph and Twitter.
 * Canonical and social URLs are only emitted when the site URL is configured, because a relative
 * one would otherwise resolve against localhost or a preview deployment.
 */
export const publicPageMetadata = ({ title, description, path }: PublicPageInput): Metadata => {
  const hasSiteUrl = getSiteUrl() !== undefined;
  const images = hasSiteUrl
    ? [{ url: OG_IMAGE_PATH, width: OG_IMAGE_SIZE.width, height: OG_IMAGE_SIZE.height, alt: OG_IMAGE_ALT }]
    : undefined;

  return {
    title: { absolute: title },
    description,
    ...(hasSiteUrl ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      ...(hasSiteUrl ? { url: path } : {}),
      images,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images },
  };
};

/** Metadata for pages behind sign-in: never indexed, links not followed. */
export const privatePageMetadata = (title: string): Metadata => ({
  title,
  robots: { index: false, follow: false, nocache: true },
});
