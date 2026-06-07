# Original User Request

## 2026-06-07T18:20:32Z

Refactor the text editing architecture in the "Draw Anything" whiteboard to behave natively on the canvas (perfect overlay, no layout shifts) and support rich-text formatting (bold/italic on specific words) without feeling like a standard browser input.

Working directory: /Users/adityashah/Developer/Aditya Projects/Full Stack Projects/Draw-Anything
Integrity mode: development

## Requirements

### R1. Seamless Canvas Integration
Text editing must perfectly align with the canvas rendering (no jumping or size changing when entering/exiting edit mode). The text editor must use transparent backgrounds and precisely matched font sizes/metrics.

### R2. Rich Text Formatting Support
Users must be able to select specific words within a text block and apply formatting (bold, italic) independently of the rest of the text. Use Markdown-based string serialization (e.g., `Hello **World**`) to store formatting in the JSON payload, and parse this markdown within the canvas rendering functions (`renderTextToCanvas`, `renderShapeLabel`).

### R3. Modern Web Guidance
Use modern web guidance best practices. Review `modern-web-guidance` results for canvas HTML overlays. Avoid adding heavy third-party rich text libraries like Slate or Quill; prefer a lightweight custom implementation or a highly optimized minimal dependency.

## Acceptance Criteria

### Interaction Fidelity
- Double-clicking text does not shift the text visibly by even 1 pixel (perfect overlay).
- Text fields accurately reflect zooming and panning dynamically while editing.

### Rich Text Formatting
- Selecting a specific word and pressing `Ctrl+B` applies bold only to that word.
- The canvas renderer accurately parses and renders the bold word alongside regular words on the same line without breaking word-wrap alignment.
