# Product Overview

## What This Product Is

This project is a multi-course teaching website that helps students learn through interactive visual tools, organized course hubs, and optional AI-assisted guidance.

The product is designed for classroom and self-study use, with fast browser access and no installation required for learners.

## Core User Experience

The site provides three connected experiences:

1. Course discovery and navigation
- Users start at the main landing page and choose a course.
- Each course hub presents topics and tools in a structured, easy-to-scan layout.

2. Interactive concept learning
- Students open visualizers and simulations to explore technical ideas step by step.
- Most tools are focused, single-purpose pages (for example, tree operations, hashing, routing, subnetting).

3. Contextual support
- Course pages include an instructor drawer for profile/contact context.
- Some pages include an AI assistant panel for quick explanations and guidance tied to the current course.

---

## Product Areas

### 1) Main Hub
Primary page: index.html

Functionality:
- Presents top-level course options.
- Acts as the central navigation entry point.
- Maintains a consistent visual identity shared across course pages.

### 2) Course Hubs
Primary pages:
- cs112/index.html
- cs339/index.html
- cs432/index.html
- ai100/index.html

Functionality:
- Organize content by category, layer, topic, or module.
- Provide quick access to visual tools.
- Surface course-scoped AI support where enabled.
- Reuse common patterns (cards, accordions, drawers, themed styling).

### 3) Visualizer and Tool Pages
Primary locations:
- cs112/*.html
- cs339/*.html

Functionality:
- Deliver interactive demonstrations of course concepts.
- Use animations and direct manipulation to make abstract ideas concrete.
- Run as mostly self-contained mini-apps for simple maintenance and iteration.

### 4) Viewer Wrapper Experience
Primary page: viewer.html

Functionality:
- Loads a selected tool into an iframe.
- Adds consistent framing: top bar context, naming, and back navigation.
- Applies course-aware visual context so users remain oriented while moving between tools.

### 5) AI Assistant Flow
Client pages call a proxy endpoint; server proxy is worker.js.

Functionality:
- Accepts student questions from course pages.
- Sends course-context prompts through a proxy layer.
- Returns formatted responses to the assistant panel.
- Keeps API credentials off the client by routing model calls through the Worker.

---

## Shared Product Capabilities

### Theming and consistency
- Shared CSS tokens and component styles provide a common look and feel.
- Course-level themes preserve distinct identity while keeping UI behavior familiar.

### Reusable UI components
- Shared instructor drawer markup and loader reduce duplication.
- Shared markdown rendering supports rich assistant responses.
- Common interaction patterns (expand/collapse, overlays, cards) are reused across hubs.

### Static-first reliability
- The product works as static pages with minimal runtime complexity.
- No build pipeline is required for normal content and UI updates.

---

## Primary User Journeys

1. Explore course content
- Open site home.
- Choose a course.
- Browse topic groups.
- Open a tool and interact with it.

2. Learn with visual feedback
- Select a concept visualizer.
- Change inputs or step through actions.
- Observe animations/state changes to build understanding.

3. Ask for help in context
- Open AI assistant on a course page.
- Submit a question.
- Receive course-relevant explanation rendered in the assistant drawer.

4. Return and continue
- Use viewer back navigation and course hub structure to move between related tools quickly.

---

## Product Scope and Constraints

Current scope:
- Browser-based educational content delivery.
- Interactive concept demonstrations for supported courses.
- Lightweight AI guidance integrated in selected hubs.

Deliberate constraints:
- No framework-heavy frontend architecture.
- No mandatory backend beyond optional AI proxy behavior.
- Manual browser validation is the primary quality gate.

---

## Success Characteristics

The product is successful when:
- Students can find the right concept/tool quickly.
- Visualizers make complex material easier to understand.
- Navigation feels coherent across courses and tools.
- Shared components keep the experience consistent.
- Contributors can add or improve tools without breaking unrelated pages.
