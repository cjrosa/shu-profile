# Chapter 5, Scene 3: autoregressive generation

Open `ai100/llm_explorer.html?chapter=5&scene=3`.

## Final-position vector handoff

The flying vector represents one position: the last token's contextualized
representation, conceptually incorporating the permitted earlier context. The
miniature network now explicitly illustrates output projection, not another
transformer pass. Its output precedes probability emphasis and token selection.

Initial contexts use Scene 1's actual teaching-layer output without modification.
Continuation states have at most three authored logits, padded with zero for
unused rows. For logits `[a,b,c]`, the authored final-position representation is
`[a-b,b-c,c]`. The fixed projection rows `[1,1,1]`, `[0,1,1]`, `[0,0,1]` recover
the existing logits in state-vocabulary order. These representations are
calibrated teaching parameters, not transformer-computed continuation outputs,
raw embeddings, or probabilities. This qualification appears in the existing
simulation disclosure. Initial projection parameters, all scores, softmax,
temperature, and selection calculations remain unchanged.

The three cells use Chapter 4's 50-by-30 geometry, spacing 57, radius 5, numerical
blue/purple/gray mapping, and .36 emergence scale. One SVG group leaves the last
token, follows an element-relative gutter route, and rotates as a unit to align
with the three input nodes before fading. Each cell keeps its model-derived
color; the input nodes retain their solid blue fill. The prediction phase still
lasts 1300 ms: context emphasis, emergence/flight, input activation at 43%,
hidden activation at 61%, output activation at 77%, and probability emphasis.
Reduced motion shows the grouped vector at its destination without travel.
All effects belong to the existing animation registry for pause/resume, reset,
settings changes, and elapsed-time-preserving resize handling.

Files changed for this enhancement: `assets/js/ai100/llm-response-model.js`,
`assets/js/ai100/llm-response.js`, `ai100/llm_explorer.html`,
`tests/llm-response.test.cjs`, and this documentation. All 54 focused response,
layer, explorer, and temperature tests passed, including exhaustive reachable
state projection checks, vector grouping/geometry/color checks, updated-context
vectors, and existing playback/regression coverage. Browser inventory was empty;
rendered motion, label clearance, and responsive visual QA remain outstanding.

## Teaching model

`assets/js/ai100/llm-response-model.js` is the authoritative continuation graph.
The empty continuation delegates directly to `llmPredictionModel.calculate`, so
all five examples retain the approved starting scores and probabilities.
Every subsequent row is `[individual token, unscaled logit, successor state]`.
Stable softmax uses `exp((score - maximumScore) / temperature)` and normalizes
over every individual candidate. The first five entries form the preview;
remaining entries contribute to Other tokens, which is never sampled itself.

The model resolves a state by traversing the original example and every
generated token. Different paths can deliberately merge into the same authored
state, so equivalent states can share distributions. This finite-state model
does not claim learned semantics, neural inference, or realistic tokenization.

All ten New Haven starting candidates have explicit routes in `cityRoutes`.
Other examples use their shared initial vocabulary, then enter adjective,
traveler, or chase states. Every edge leads to another defined state except
`[end]`, which terminates without appending visible text. The `ending -> and ->
more -> ending` branch allows longer samples and exercises the eight-token
demonstration limit. Repeated conjunctions are possible in this deliberately
small vocabulary; outputs are illustrative, not guaranteed fluent responses.

## Integration and playback

The scene reuses `llmPredictionView.tokens` and `.probabilities`, exposes and
reuses Scene 2's existing `choose` function, and extends existing CSS selectors
to include Scene 3. The Chapter 4 Scene 4 toolbar markup, SVG paths, and exact
CSS rules are reused. Temperature uses the same range, disclosure layout,
tooltip, and calculation conventions as Scene 2.

Predict, select, append, and repeat phases take 1300/700/650/650 ms. One Step
completes a cycle; Play repeats cycles. A selected token travels to its appended
position using a cancellable Web Animation. Pause retains the phase, chosen
token, remaining timer, and animation position. Settings changes cancel pending
work while retaining committed tokens. Revision guards reject stale callbacks.
Reset restores New Haven, greedy, temperature 1, closed disclosures, and no
generated tokens. Navigation pauses and removes floating animation elements.
Reduced motion omits movement and uses brief stage updates.

### Miniature prediction engine

The existing processing box now contains a conceptual 3-input, 3-hidden,
1-output SVG. It reuses Chapter 4's blue/purple/green node palette, white
two-pixel node strokes, and subtle purple 1.5-pixel synapses. An information
tooltip clarifies that it is neither literal transformer architecture nor GPU
execution order. No model, selection, probability, or navigation code changed
for this enhancement.

The existing 1300 ms prediction phase owns one finite Web Animations timeline:
context transfer, input emphasis, input-to-hidden pulses, hidden emphasis,
hidden-to-output pulses, output emphasis, and transfer to the probability panel.
A brief outline emphasizes the distribution before the existing Select phase.
Text stage indicators and active borders supplement the solid node colors.
There are no independent timers, repeating animations, or extra Step actions.

Pause/resume controls those animation objects alongside the generation timer.
Reset, settings changes, and selection cancel them. Resize and motion-preference
changes rebuild at the current elapsed time. Reduced motion removes traveling
pulses while retaining ordered, discrete node emphasis over the prediction
phase; subsequent reduced-motion generation stages retain their brief timing.

Enhancement files: `ai100/llm_explorer.html`, `assets/js/ai100/llm-response.js`,
`assets/css/pages/llm-response.css`, `tests/llm-response.test.cjs`, and this file.
All 42 focused response, explorer, and temperature tests passed, including
animation ownership, node ordering, pulse timing, pause/resume, cancellation,
and reduced-motion assertions. These inspect animation definitions and lifecycle
with JSDOM; they do not establish rendered appearance. Browser inventory was
empty, so visual, projector, and responsive review remain outstanding.

## Validation

`tests/llm-response.test.cjs` exhaustively traverses reachable contexts through
the limit, checks softmax and temperature numerically, verifies weighted
sampling, and exercises DOM playback with controlled timers. Cases cover
pause/resume at every phase, duplicate clicks, stale callbacks, settings,
all examples, omitted candidates, EOS, length limit, keyboard interaction,
navigation, and reduced motion. These are JSDOM tests, not browser visual QA.

Browser visual review remains required: no browser was connected to the UI
automation tool in the implementation environment. Review desktop and narrow
layouts, projector readability, touch, token movement, toolbar appearance, and
the preceding approved scenes before instructor approval.

## Implementation report

Added:

- `assets/js/ai100/llm-response-model.js`: continuation scores and transitions.
- `assets/js/ai100/llm-response.js`: playback, settings, and scene interactions.
- `assets/css/pages/llm-response.css`: compact layout and motion styling.
- `tests/llm-response.test.cjs`: numerical and interaction coverage.
- `docs/llm-response.md`: model documentation and review notes.

Updated:

- `ai100/llm_explorer.html`: scene markup and asset registration.
- `assets/js/ai100/llm-explorer.js`: Scene 3 navigation and subtitle.
- `assets/js/ai100/llm-selection.js`: exposes the existing selection function;
  Scene 2 behavior is unchanged.
- `assets/css/pages/llm-prediction.css` and `llm-stack.css`: extend existing
  selectors to Scene 3; earlier scene rules retain their values.
- `tests/llm-explorer.test.cjs` and `llm-temperature.test.cjs`: update asset
  inventory and replace the old Scene 3 placeholder expectation.

Validation results: all 39 tests in the final focused explorer, response, and
temperature run passed. The broader 162-test run exposed six existing RNN
failures, reproduced with the original HEAD files, and one stale asset-inventory
assertion subsequently updated and verified by the focused run. No RNN behavior
was changed. `git diff --check` passed. Browser, touch, projector, and responsive
visual verification remain outstanding rather than being inferred from JSDOM.

### Chapter 4 visual consistency correction

Scene 3 now clones the actual initialized `#layerDiagram .layer-network-demo`
artwork. It uses the original `539 373 72 48` viewBox, seven radius-6 nodes,
nine polyline paths, solid blue/purple/green fills, white width-2 strokes, and
the exact purple synapse style. Chapter 4 source and behavior are unchanged.
The existing script order initializes the source SVG before Scene 3. Pulse
routes are derived from the cloned paths, with duplicate output segments
deduplicated. Existing prediction timing, pause/resume, and reduced-motion
behavior remain in place. Active borders replace node translucency.

Display size is 120 by 80 CSS pixels (proportional on narrow screens), compared
with the original nominal 90 by 60 size. Box padding is 12 pixels; status minimum
height is 20 pixels with a 6-pixel top margin. Title, tooltip, and status remain.
Changed files for this correction: scene HTML, response JS/CSS, response tests,
and this document. No probability, teaching-model, selection, navigation, or
approved-scene code was changed.

All 51 response, layer, temperature, and explorer tests passed. New assertions
compare exact SVG geometry and presentation attributes, synapse CSS, coordinate
projections at equal 90- and 120-pixel widths, and the untouched source SVG after
playback/reset. Browser inventory remains empty: these checks establish artwork
identity and animation lifecycle, but do not replace rendered side-by-side QA.
