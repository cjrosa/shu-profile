# Chapter 4, Scene 2: Queries, Keys, and Attention Scores

Open ai100/llm_explorer.html?chapter=4&scene=2. Local implementation, awaiting instructor review; no deployment.

## Approved numerical model

assets/js/ai100/llm-qk-model.js is unchanged. It uses a fixed three-coordinate word lookup and two-dimensional Query/Key projections. For representation [a,b,c], Q = [b + 0.5c, a - 0.5c] and K = [a + 0.25c, b - 0.5c]. Scores are dot(Q,K)/sqrt(2). Future positions are masked before stable softmax. Weights are nonnegative and sum to one before rounding.

For they and pizzas, Q=[1.5,0.2], K=[2.05,-0.1], dot=3.055 and scaled score=3.055/sqrt(2). These are teaching parameters, not trained embeddings. No Value aggregation is implemented.

## Primary visualization

Each vector has exactly two actual cells with visible two-decimal values and three-decimal black hover/focus tooltips. No values are repeated or invented. The primary flow shows the selected scaled score, all permitted source scores with the selected source highlighted, and its normalized attention weight. The complete distribution sits immediately below the flow. A short vertical marker identifies the center of the selected source's highlighted segment. The comparison now follows a centered downward progression with short connectors; six scores fit per row and the weight uses a compact two-line label. Both share a 940px maximum width and one horizontal scroll surface, preserving alignment on narrow viewports. The familiar token/attention diagram follows below.

The Query DOM and values stay fixed during source changes. The Key, selected score, highlighted score entry, attention weight, connector and selected bar segment update together. Target changes recalculate all permitted scores and weights. The score pool includes no future positions. Example selection, reset, token/source selection, hover restoration and keyboard interactions remain available without staged reveals.

## Color and style

The primary cells reuse the Visualizer's 50 by 30 geometry, 5px corners, 7px gaps, sign hues (positive 215, negative 270), saturation 45%, gray near zero, and lightness endpoints 85% and 40%. To distinguish values such as pizzas=2.05 and team=1.05, the scale uses one fixed maximum magnitude calculated from every Query and Key projection of the teaching vocabulary: 2.05. Lightness is 85 - 45 * abs(value)/2.05. Magnitudes below 0.0005 use #e1e5e3. The scale does not change with source, target or example. Only color encoding is calibrated; parameters and numerical calculations are unchanged.

Numbers sit below the colored cells using the established SVG numerical font, so they remain readable even with dark fills. Existing SVG headings, text sizes, purple 2px connectors, token geometry, source colors, dropdowns and message classes are retained. Primary colors never encode semantic confidence or attention percentages.

## Expandable details and scope

The detailed arithmetic inside Inspect the calculation and teaching parameters shows only the two actual dimensions. Symbolic Dimensions 3 and 4 and their ellipses have been removed. The SVG height is reduced from 425 to 235, bringing Dot Product, Scaled Score and Attention Weight directly beneath the products and sum. Two concise notes below the SVG explain the two-dimensional simplification and normalization against all permitted scores. Projection parameters and assumptions follow it. The conceptual view above is unchanged.

Scene 1 retains authored illustrative weights; Scene 2 identifies its calculated teaching weights. The approved model, conceptual renderer, calculation-update logic, interaction handlers, page HTML and scene styles were hash-compared against the start of this refinement and are unchanged. Only the expanded calculation markup, its coordinates, and explanatory notes changed. Shared scripts/styles and other approved scenes were not edited.

## Validation

All 52 targeted tests pass, including checks for exactly two calculation dimensions, removal of symbolic rows/ellipses, the compact SVG bounds, the requested note text, and dynamic numerical agreement:

node --test tests/llm-qk.test.cjs tests/llm-self-attention.test.cjs tests/llm-explorer.test.cjs tests/llm-transformer-ui.test.cjs

Coverage includes all example/target/source combinations; projection and score calculations; stable softmax normalization; causal masking; two visible vector values and calibrated colors; distinct pizzas/team colors; Query preservation; agreement between primary scores, expanded arithmetic and weights; complete permitted-score membership; selected score and distribution state; connector endpoints; tooltip focus/hover; examples, reset, keyboard interaction and rapid updates.

Browser discovery again returned no available browsers. Actual rendered layout, typography, narrow-view scrolling, connector alignment and projector readability still require browser review. DOM tests and source reuse are not visual verification. The earlier broad Explorer test run had six pre-existing RNN test failures, reproduced with pre-change files; those unrelated scenes remain out of scope.

## Final visual refinements

The selected permitted score uses the existing green-soft selected fill, a 3px source-color border matching its bar segment, and bold purple text matching the Key/compatibility score. Underlining is removed. The selected state is also exposed in its accessible label. Distribution label and bar use their original Scene 1 order and margins; the reverse-order and custom-margin overrides were removed. The primary label is now simply Attention weight, with the requested concise relative-weight explanation below the permitted scores.

All 52 targeted tests pass after these changes. Model parameters, page HTML, shared navigation, Scene 1 assets, expanded calculation code and interaction handlers are unchanged. Browser discovery returned no enabled browsers; rendered projector/readability verification remains pending.
