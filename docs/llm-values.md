# Combining Values (Chapter 4, Scene 3)

Entry: `ai100/llm_explorer.html?chapter=4&scene=3`.

The scene uses `llm-qk-model.js` directly for representations, scores, stable softmax, and causal weights. Approved Scene 1 and Scene 2 files are unchanged. The existing Scene 3 ID is retained for navigation compatibility.

## Teaching model

For X = [a, b, c], V = [0.5a - 0.5c, 0.5b - 0.25c]. In row-vector notation, W_V is the 3-by-2 matrix [[0.5, 0], [0, 0.5], [-0.5, -0.25]]. The code stores its transpose because the existing project() function accepts one row per output coordinate.

Contribution j is alpha_ij times V_j. Output is the dimension-wise sum of all contributions. Future positions have zero weights. Full precision is retained until presentation. These fixed parameters are not learned by a real model.

The projection deliberately includes positive and negative coordinates, and a counterexample to weight-only magnitude reasoning: for the default target, pizzas has more attention than they, but a smaller absolute contribution in dimension 2.

## Presentation and controls

The existing SVG text classes, 50-by-30 rounded vector cells, source palette, target controls, example picker, bar, message boxes, and disclosure conventions are reused in scene-scoped code. The NLP & RNN Visualizer's blue/purple/near-zero color mapping uses its original fixed magnitude scale 0–1. Every Value lies within this scale; weighted Values and their convex sum also stay within it.

Sources are selected through their row/word, cells, bar, or target-tile percentage. Target tiles retain arrow/Home/End and Enter/Space behavior, including Shift+activation to inspect a permitted source. Sources respond to Enter/Space, focus, and hover. All updates are synchronous; no motion or delayed updates are required. Examples retain Scene 2's matching-word target preservation and reset behavior.

## Validation

Run `node --test tests/llm-values.test.cjs tests/llm-qk.test.cjs tests/llm-self-attention.test.cjs tests/llm-explorer.test.cjs`.

Tests cover all examples and targets, independently calculated projections and sums, unchanged attention weights, masking, color/geometry attributes, displayed rounding, source/target synchronization, keyboard use, example changes, reset, and rapid changes. Existing scene regression tests are included.

Browser visual validation is outstanding: the browser tool reported no available browsers or apps. DOM tests are not browser validation. Instructor review should compare Scenes 1–3 at identical desktop and narrow widths, checking source connectors, horizontal scrolling, tooltips, typography, and projector readability, including the longest example.
