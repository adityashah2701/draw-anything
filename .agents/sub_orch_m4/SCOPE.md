# Scope: M4: Text Overlay & Rich Text

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M4.1 | Seamless canvas integration: perfect overlay text editing, transparent backgrounds, precisely matched font sizes/metrics. Double-click no 1px shift. Pan/zoom support. | none | PLANNED |
| 2 | M4.2 | Rich text formatting serialization: Implement Markdown serialization for bold/italic (`Hello **World**`) in JSON payload. | M4.1 | PLANNED |
| 3 | M4.3 | Canvas rendering: Parse Markdown in `renderTextToCanvas` and `renderShapeLabel`, render formatted text without breaking word-wrap alignment. | M4.2 | PLANNED |
| 4 | M4.4 | Modern Web Guidance: review html overlays with `modern-web-guidance` tool. Lightweight custom implementation for rich text editing. | M4.3 | PLANNED |
