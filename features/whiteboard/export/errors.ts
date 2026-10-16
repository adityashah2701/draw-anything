export type ExportErrorCode =
  | "nothing-to-export"
  | "no-selection"
  | "too-large"
  | "render-failed"
  | "unsupported"
  | "clipboard-unsupported"
  | "clipboard-denied"
  | "cancelled";

/** An export failure the editor can show the user as-is; the message is safe to display. */
export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}
