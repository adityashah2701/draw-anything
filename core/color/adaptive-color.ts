export const getAdaptiveColor = (color: string | undefined, isDark: boolean): string => {
  if (!color) return isDark ? "#ffffff" : "#000000";
  const c = color.toLowerCase();

  if (isDark) {
    if (c === "#000000" || c === "black" || c === "#1e293b" || c === "#111318") {
      return "#ffffff";
    }
  } else {
    if (c === "#ffffff" || c === "white" || c === "#f8fafc") {
      return "#000000";
    }
  }
  return color;
};
