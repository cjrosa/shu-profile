# Chapter 4, Scene 4: Inside a Transformer Layer

Scene 4 uses one pre-normalization causal decoder layer. It is an inference-time teaching simulation with fixed parameters, not a trained model. One word per position remains a simplification. No prediction head or additional layer is simulated.

The residual stream has three coordinates. Each sublayer receives a normalized copy of its input, while a bypass carries the unnormalized input to an addition point. The first addition precedes the second normalization. The final addition produces the layer output; there is no post-addition normalization in this diagram.

## Deterministic model

`llm-layer-model.js` reads the existing word representations and Query/Key matrices from `llm-qk-model.js`, and the Value matrix from `llm-values-model.js`. Neither approved model is modified.

Normalization subtracts the coordinate mean and divides by the square root of the population variance plus 0.00001. Its scale is one and offset zero. This is applied independently to every position before attention, and to the first residual sum before feed-forward processing.

Attention uses the approved Query/Key/Value projection parameters on **normalized** representations. Scores are divided by the square root of two, future positions are masked, and a maximum-subtracted softmax supplies the weights. Consequently Scene 4 attention weights differ from Scene 3; Scene 3 itself remains unchanged. The two-coordinate weighted Value sum is projected to the three-coordinate residual stream using the following rows:

```
WO = [[0.25, 0], [0, 0.25], [0.125, -0.125]]
```

The first residual sum is the selected input plus this projected attention output. Feed-forward processing uses these fixed matrices, a zero bias, and a ReLU between them:

```
W1 = [[0.3, -0.2, 0.1], [-0.1, 0.3, 0.2],
      [0.2, 0.1, -0.3], [-0.2, 0.1, 0.3]]
W2 = [[0.2, -0.1, 0.1, 0.1], [0.1, 0.2, -0.1, 0.1],
      [-0.1, 0.1, 0.2, -0.1]]
```

Rows are output coordinates; each projection takes their dot products with the input. These same parameters apply independently to every token position. The second residual sum adds the feed-forward output to the first residual sum. All arithmetic uses full precision; displayed values are rounded to three decimals.

The vector renderer retains the approved 50 × 30 cells, 57-unit pitch, five-unit corner radius, blue positive hue, purple negative hue, and neutral near-zero color. A single fixed magnitude range of 0–4 is used throughout this scene. This accommodates residual values without clipping: normalized three-coordinate values have magnitude below sqrt(2); attention output magnitude is at most sqrt(2)/4; feed-forward output magnitude is below 0.425; input magnitude is at most two. The overall bound is below 2.78.

## Interaction and lifecycle

Every component is available immediately. Click or Enter/Space selects a component; hover and focus temporarily inspect it. Token tiles use the approved arrow-key/Home/End selection convention. The example picker retains the existing listbox behavior and resets to each example's specified default target. Reset restores that example's target and attention selection.

Play traces a finite eight-stage pass; Step selects one stage without motion. Residual stages animate both the transformation path and the bypass into the same addition point. Timing is illustrative, not computation time. Reduced motion disables Play and keeps Step available. Token/example changes, reset, direct inspection, scene departure, document hiding, and reduced-motion changes cancel playback and remove animation nodes.

## Validation

Run `node --test tests/llm-layer.test.cjs` for independent numerical reference checks, causal invariance, all example targets, keyboard interaction, picker/reset, navigation, timer cancellation and reduced motion. Existing attention tests cover preservation of the approved calculations.

Rendered browser comparison remains required for instructor review: the available browser-control service returned no browsers during implementation. Source-based reuse and DOM tests do not verify projector readability, actual font rendering, clipping, mobile scrolling, or motion appearance.
