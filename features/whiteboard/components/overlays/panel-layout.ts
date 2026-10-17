import { useEffect, useState } from "react";

/**
 * Widths of the two side panels. They shrink with the window, so the canvas keeps room to draw in: both open
 * take about 56% of a 1360px window and never more than 880px. The CSS strings and `panelWidths` give the same numbers.
 */
export const AGENT_WIDTH_CSS = "clamp(320px, 26vw, 400px)";
export const CODE_WIDTH_CSS = "clamp(340px, 30vw, 480px)";

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

export const panelWidths = (viewportWidth: number) => ({
  agent: clamp(320, viewportWidth * 0.26, 400),
  code: clamp(340, viewportWidth * 0.3, 480),
});

const currentWidth = () => (typeof window === "undefined" ? 1280 : window.innerWidth);

/** How much of the right edge the open panels cover. */
export const coveredByPanels = (agentOpen: boolean, codeOpen: boolean, viewportWidth = currentWidth()) => {
  const widths = panelWidths(viewportWidth);
  return (agentOpen ? widths.agent : 0) + (codeOpen ? widths.code : 0);
};

/** `coveredByPanels`, kept current as the window is resized. */
export const usePanelInset = (agentOpen: boolean, codeOpen: boolean) => {
  const [viewportWidth, setViewportWidth] = useState(currentWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return coveredByPanels(agentOpen, codeOpen, viewportWidth);
};
