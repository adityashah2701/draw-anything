import { absoluteUrl, LOGO_ASSET_PATH, SITE_DESCRIPTION, SITE_NAME } from "./site";

/**
 * JSON-LD for the home page. Only facts that are also visible on the page: what the product is and
 * what the page's capability list says it does. No ratings, reviews, prices or statistics, because
 * none exist to cite.
 */
export const buildHomeStructuredData = () => {
  const url = absoluteUrl("/");
  const organizationId = url ? `${url}#organization` : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        ...(organizationId ? { "@id": organizationId } : {}),
        name: SITE_NAME,
        ...(url ? { url } : {}),
        ...(absoluteUrl(LOGO_ASSET_PATH) ? { logo: absoluteUrl(LOGO_ASSET_PATH) } : {}),
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        applicationCategory: "DesignApplication",
        operatingSystem: "Web browser",
        ...(url ? { url } : {}),
        ...(organizationId ? { publisher: { "@id": organizationId } } : {}),
        featureList: [
          "An AI agent that draws a described diagram on the canvas",
          "Orthogonal connectors that route around shapes and re-route when you move them",
          "Live multiplayer editing on the same board",
        ],
      },
    ],
  };
};

/** Serialise for a `<script type="application/ld+json">`; `<` is escaped so the data can never close the tag. */
export const serializeJsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
