# Contributing Guide

Thanks for contributing to this project. This site is a collection of static teaching pages and visualizers, so the contribution approach is intentionally simple: small, focused edits, clear behavior, and strong manual testing.

## Project Model

- Stack: plain HTML, CSS, and vanilla JavaScript.
- Build system: none.
- Runtime: browser-first static pages, plus optional Cloudflare Worker support for AI proxying.
- Structure:
  - Root pages: `index.html`, `viewer.html`
  - Course hubs: `cs112/index.html`, `cs339/index.html`, `cs432/index.html`, `ai100/index.html`
  - Shared assets: `assets/css/*`, `assets/js/components/*`, `assets/components/*`
  - Standalone tools: mostly self-contained pages under `cs112/` and `cs339/`

## Contribution Principles

1. Keep changes scoped.
- Edit only files required for your task.
- Avoid broad refactors unless explicitly requested.

2. Preserve page isolation.
- Most tool pages are intentionally standalone.
- Do not couple independent visualizers through shared state or hidden dependencies.

3. Reuse shared assets when it improves consistency.
- Shared styles belong in `assets/css/components/` (or `assets/css/pages/` for course-level styling).
- Shared UI fragments should use existing component patterns (for example, instructor drawer loader/component).

4. Maintain existing visual language.
- Respect current theme variables and course theme classes.
- Avoid introducing a new design system for small changes.

5. Keep JavaScript simple and framework-free.
- Use browser APIs and small helpers.
- Prefer readable functions over complex abstractions.

## Editing Guidelines

- Follow existing naming and file purpose conventions.
- Keep comments brief and meaningful.
- Do not add new dependencies or tooling unless requested.
- For AI-related features, route requests through the Worker proxy; do not expose API keys in client code.
- When linking tools from course hubs, prefer the existing `viewer.html` pattern when consistent context/back navigation is needed.

## Testing Checklist (Manual)

Before submitting:

- Page loads with no console errors.
- Layout is usable on desktop and mobile widths.
- Interactive controls respond correctly (accordions, drawers, search, animations).
- Viewer flow works when applicable (`viewer.html` parameters, back link, iframe content).
- Theme styling is consistent with the target course page.
- If AI UI was changed: request/response path still works through Worker proxy.

## Pull Request Expectations

- Use a clear title and concise description.
- Explain what changed, why, and which files were touched.
- Include manual validation notes (what you tested and where).
- Keep PRs small and reviewable whenever possible.

## Out of Scope (Unless Requested)

- Large cross-page redesigns.
- Monorepo-style restructuring.
- Introducing frameworks, bundlers, or package-manager workflows.

Following these guidelines helps keep the project maintainable, teachable, and easy to extend across courses and semesters.
