let override: boolean | null = null;

/** Whether canvas drawing should use dark-mode colours: the export override if one is active, else the page theme. */
export const isDarkRender = (): boolean =>
  override ?? (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

/** Run synchronous drawing with a fixed theme, whatever the page theme is (exports are always light). */
export const withRenderTheme = <T>(dark: boolean, draw: () => T): T => {
  const previous = override;
  override = dark;
  try {
    return draw();
  } finally {
    override = previous;
  }
};
