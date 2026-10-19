export const BOARD_EXAMPLES: Array<{ tag: string; text: string }> = [
  { tag: "Group", text: "Group the selected nodes and name the group" },
  { tag: "Align", text: "Align the selected cards vertically with equal spacing" },
  { tag: "Icon", text: "Change the database icon and make the nodes the same size" },
  { tag: "Tidy", text: "Clean up this diagram without changing what it says" },
  { tag: "Labels", text: "Rename the auth flow labels and re-route the connectors" },
];

/** Draw-something examples, offered next to the edit examples when the panel is one conversation. */
export const UNIFIED_EXAMPLES: Array<{ tag: string; text: string }> = [
  { tag: "Arch", text: "Draw a web app backend with a CDN, API gateway, auth, orders service and Postgres" },
  { tag: "Flow", text: "Draw a user login flow with MFA and a retry after a failed password" },
  { tag: "Mind", text: "Draw a mind map for planning a product launch" },
  ...BOARD_EXAMPLES.slice(0, 3),
];
