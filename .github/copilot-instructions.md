# Project Guidelines

## Code Style
- This workspace is a static site: standalone HTML files with inline CSS and inline JavaScript.
- Prefer vanilla JavaScript and browser APIs; do not introduce frameworks or build tooling unless explicitly requested.
- Preserve the existing visual style in each file (CSS custom properties in :root, serif-forward typography, compact UI controls).
- Keep changes local to the target file. Many pages are intentionally self-contained and do not share utilities.

## Architecture
- Main hub: index.html.
- Course pages: cs112.html, cs339.html, cs432.html.
- Visualizer pages are mostly independent single-file apps (for example bst_*.html, avl_rotation_explorer.html, heap_full_animation.html, cidr_viz.html, routing_viz.html).
- worker.js exists as a standalone script; only modify if a page explicitly depends on it.

## Build And Test
- No package manager, build step, or automated test suite is configured.
- Run by opening the edited HTML file in a browser.
- Validate changes manually in-browser:
  - page loads without console errors
  - controls respond correctly
  - canvas/SVG animations render and resize correctly
  - layout remains usable on desktop and mobile widths

## Conventions
- Treat each HTML file as an isolated app unless shared behavior is clearly present.
- Do not refactor across many pages unless explicitly asked; duplicate patterns are common by design.
- Prefer editing canonical files and avoid touching backups unless requested:
  - index.html is canonical
  - cs112.html, cs339.html, cs432.html are canonical course pages
- Keep filenames and page purpose aligned (for example bst_delete_animation.html vs bst_delete_animation_complex.html).
- Avoid introducing non-ASCII unless the file already uses it and it is necessary.
