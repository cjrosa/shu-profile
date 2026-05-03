# SHU Profile Page

A static, multi-course teaching site with interactive visualizers, course hubs, and optional AI-assisted guidance.

## Overview

This repository hosts browser-based learning experiences for multiple courses:

- CS112 (Data Structures)
- CS339 (Networking and Data Communication)
- CS432 (Cloud Computing)
- AI100 (Foundations of AI)

The project is intentionally lightweight:

- Plain HTML, CSS, and vanilla JavaScript
- No framework runtime
- No build step
- Optional Cloudflare Worker for AI proxying

## Project Structure

```text
.
|- index.html                 # Main landing page
|- viewer.html                # Shared tool wrapper (iframe + context bar)
|- worker.js                  # Cloudflare Worker proxy for AI requests
|- PRODUCT.md                 # Product functionality and scope
|- ARCHITECTURE.md            # System architecture and technical design
|- CONTRIBUTING.md            # Contribution standards and workflow
|- ai100/                     # AI100 course hub
|- cs112/                     # CS112 hub + interactive visualizers
|- cs339/                     # CS339 hub + interactive visualizers
|- cs432/                     # CS432 course hub
|- assets/
|  |- css/                    # Shared reset/base/components/page styles
|  |- js/components/          # Shared JS helpers
|  |- components/             # Shared HTML fragments
|  |- profile-photo.jpg       # Shared media assets
|  \- AI-Lab-Class-1220x686.jpg
\- .github/
   |- copilot-instructions.md
   \- PULL_REQUEST_TEMPLATE.md
```

## Running Locally

Because this is a static site, you can run it with any local web server.

### Option A: Python (recommended)

From the project root:

```bash
python -m http.server 8000
```

Then open:

- http://localhost:8000/

### Option B: VS Code Live Server

- Open the project in VS Code.
- Start a static server (for example, Live Server extension).
- Open the served root URL.

## AI Assistant Integration (Optional)

Some course hubs include AI search/drawer interactions.

- Client pages call a proxy URL.
- The proxy is implemented in worker.js.
- The Worker forwards requests to Anthropic Messages API.
- API keys must remain server-side (never in client HTML/JS).

For production, restrict CORS and configure Worker secrets securely.

## Development Guidelines

- Keep changes small and task-focused.
- Preserve standalone behavior of tool pages.
- Reuse shared assets in assets/css and assets/js/components when appropriate.
- Keep JavaScript framework-free and readable.
- Prefer viewer.html links when consistent tool framing/back navigation is needed.

See:

- PRODUCT.md
- ARCHITECTURE.md
- CONTRIBUTING.md

## Manual Test Checklist

Before opening a PR:

- Confirm pages load without console errors.
- Check desktop and mobile layout behavior.
- Validate interactive controls (drawers, accordions, search, animations).
- Verify viewer.html flow where applicable.
- Confirm course theme consistency.
- If AI was touched, verify end-to-end request flow through Worker proxy.

## Contributing

Use CONTRIBUTING.md for coding and review standards.

PRs should include:

- What changed and why
- Files touched
- Manual validation notes
- Known risks/regression considerations

Use .github/PULL_REQUEST_TEMPLATE.md when opening pull requests.
