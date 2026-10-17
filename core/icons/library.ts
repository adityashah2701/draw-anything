// The bulk of the icon set, in one chunk that loads on demand (see `loadIconLibrary` in registry.ts):
// the catalog's line icons and the brand logos. Importing this file statically defeats that.
export { default as CATALOG } from "./catalog.json";
export { GLYPHS_EXTRA } from "./glyphs-extra";
export { LOGOS } from "./logos";
