# Project Architecture

## 1) Overview

This repository is a static teaching site for multiple courses, built as plain HTML, CSS, and JavaScript with no build step and no framework runtime.

At a high level, the site has three layers:

1. Navigation and course hubs
- Root landing page routes users to course pages.
- Each course page organizes tools and topics for that course.

2. Interactive visualizers
- Most tool pages are standalone HTML apps under course folders (for example, cs112/, cs339/).
- Tools are opened directly or via a shared viewer wrapper.

3. Shared presentation and utility assets
- Shared CSS component files in assets/css/components/.
- Shared utility scripts in assets/js/components/.

A small optional backend edge function (worker.js) proxies AI requests to Anthropic for course assistants.

---

## 2) Repository Structure

### Root pages and runtime entry points
- index.html: Global home page and cross-course navigation.
- viewer.html: Wrapper page that loads a selected tool in an iframe and renders a common top bar.
- worker.js: Cloudflare Worker proxy for AI requests.

### Course hubs
- cs112/index.html: Data Structures course hub.
- cs339/index.html: Networking and Data Communication course hub.
- cs432/index.html: Cloud Computing course hub.
- ai100/index.html: Foundations of AI course hub.

### Standalone tool pages
- cs112/*.html and cs339/*.html contain most interactive visualizers.
- Each tool is typically a self-contained page (UI, state, animations).

### Shared assets
- assets/css/reset.css and assets/css/base.css establish global resets, variables, and theme foundations.
- assets/css/components/ contains reusable UI styling (hero, cards, search, accordion, drawers, etc.).
- assets/css/pages/ contains course-specific page-level overrides.
- assets/js/components/ contains reusable JS:
  - markdown-renderer.js: Lightweight markdown-to-HTML rendering for AI responses.
  - instructor-drawer-loader.js: Dynamically injects the shared instructor drawer component.
- assets/components/instructor-drawer.html: Shared drawer markup used by course pages.

---

## 3) Rendering and Navigation Model

### Static-first, client-enhanced pages
All pages are delivered as static HTML. Interactivity is added with inline scripts and shared helper scripts.

### Two ways tools are loaded
1. Direct page links
- Course pages can link directly to a tool HTML file.

2. Viewer wrapper (preferred in many hubs)
- Course hubs generate links to viewer.html with query parameters:
  - tool, course, label, name, back
- viewer.html reads query params, applies course theming, and loads the selected tool in an iframe.
- This gives a consistent top bar, back navigation, and branding while leaving tool internals unchanged.

### Theme detection and styling
- Course pages set body classes such as theme-cs112, theme-cs339, theme-cs432, theme-ai100.
- base.css defines shared variables and per-theme overrides.
- viewer.html independently infers theme from query params so the wrapper color matches the loaded course.

---

## 4) UI Component Architecture

### Shared component pattern
Reusable UI is mostly split by concern into CSS component files and lightweight JS helpers.

Examples:
- Hero and profile card styling from shared component CSS.
- Accordions (category/layer groupings) implemented in each course page script, with shared class conventions.
- Drawer and overlay behavior reused across pages.

### Instructor drawer
- instructor-drawer-loader.js fetches and injects assets/components/instructor-drawer.html at runtime.
- This avoids duplicating instructor markup in each page and keeps course pages mostly content-focused.
- Pages expose openInstDrawer/closeInstDrawer handlers to control drawer visibility.

### Markdown rendering for AI panels
- markdown-renderer.js provides a minimal parser for headings, lists, code fences, links, and emphasis.
- Course AI assistants render model output through this helper before inserting into drawer UI.

---

## 5) AI Assistant Request Flow

Course pages with AI search bars use this client flow:

1. User submits query in page search UI.
2. Page builds a prompt with course-scoped instructions and conversation context.
3. Browser sends POST request to a proxy URL (Cloudflare Worker endpoint).
4. Worker forwards the payload to Anthropic Messages API using server-side API key.
5. Response is returned to browser and rendered in the AI drawer.

Security and operational notes:
- API key is not stored in client pages; it lives in worker secret configuration.
- CORS is currently permissive in worker.js (ALLOWED_ORIGIN = *), which is suitable for early testing but should be restricted for production.

---

## 6) Course and Tool Coupling Strategy

The architecture intentionally keeps coupling low:

- Course hubs know which tools belong to each section and provide discovery/search UX.
- Tool pages are mostly independent micro-apps and can evolve without changing shared components.
- viewer.html adds consistent navigation without requiring tool refactors.
- Shared assets establish visual consistency while allowing course-specific theming.

This balance supports rapid teaching-tool iteration while preserving a coherent site experience.

---

## 7) Deployment and Operations

### Hosting model
- Static site hosting for HTML/CSS/JS assets (for example, GitHub Pages or equivalent).
- Optional Cloudflare Worker deployment for AI proxy.

### No build pipeline
- No package manager, transpilation, or bundling required.
- Pages are edited and served directly.

### Manual validation focus
Given the static architecture, verification is primarily browser-based:
- Page load and layout
- Responsive behavior
- Tool interactivity/animation behavior
- Drawer and search flow

---

## 8) Extension Guidance

When adding features, follow these principles:

1. Keep tool pages self-contained unless behavior is clearly shared.
2. Add shared styles only in assets/css/components or assets/css/pages when reuse is expected.
3. Use viewer.html links for tools that benefit from consistent context and back navigation.
4. Keep AI prompts scoped by course and route all model calls through the worker proxy.
5. Preserve theme class conventions so shared CSS variables continue to work.

This approach keeps the codebase simple, teachable, and maintainable as new courses and visualizers are added.
