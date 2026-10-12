/* Phase 1: scene metadata and navigation only. No educational simulations. */
(function () {
  'use strict';
  const scene = (id, title, description, placeholder) => ({ id, title, description, placeholder });
  const chapters = [
    { id: 'predict', title: 'Predict', question: 'How can computers predict and generate language?', scenes: [
      scene('n-grams', 'What Is an N-Gram?', 'Consecutive words and overlapping groups.', 'A sentence will be grouped into overlapping sequences of consecutive words to show how n-grams are formed.'),
      scene('counting', 'Counting Word Patterns', 'Discovering repeated sequences in training text.', 'Repeated word sequences will be highlighted in a short training text and paired with their observed counts.'),
      scene('conditional-probability', 'Conditional Probability', 'Using observed patterns to predict the next word.', 'Observed word patterns will connect a preceding context to possible next words and their relative frequencies.'),
      scene('generating-language', 'Generating Language', 'Building sentences through repeated predictions.', 'A sentence will grow one word at a time as each prediction supplies the context for the next step.'),
      scene('n-gram-limits', 'The Limits of N-Grams', 'Unseen sequences and limited context.', 'Contrasting examples will reveal what happens when a word sequence is unseen or important context falls outside the n-gram.')
    ] },
    { id: 'tokenize', title: 'Tokenize', question: 'How does an LLM represent language?', scenes: [
      scene('words-tokens', 'Words vs. Tokens', 'Why tokens are not necessarily complete words.', 'The same text will be shown as words and as tokens, making differences in boundaries visible.'),
      scene('subwords', 'Subword Tokenization', 'Reusable pieces of language.', 'Related words will be separated into reusable pieces to illustrate how subword tokens represent language.'),
      scene('tokenizer', 'Inside a Tokenizer', 'Token boundaries, token IDs, and vocabulary.', 'A text example will connect token boundaries to vocabulary entries and their token IDs.'),
      scene('context-windows', 'Context Windows', 'How many tokens a model can consider.', 'A bounded token window will show which parts of a longer passage fit within the available context.')
    ] },
    { id: 'context', title: 'Context', question: 'Why does language prediction require context?', scenes: [
      scene('context-matters', 'Why Context Matters', 'Relationships between distant words.', 'Connections between distant words will show how earlier information can change the meaning of a later word.'),
      scene('rnn-approach', 'The RNN Approach', 'Sequential processing and hidden-state memory.', 'A sequence of RNN steps will show information passing forward through a hidden state.'),
      scene('long-distance', 'The Long-Distance Challenge', 'Why retaining distant information can be difficult.', 'A longer sequence will trace how information from an earlier word must travel through successive processing steps.'),
      scene('transformer', 'Enter the Transformer', 'A different approach to incorporating context.', 'A comparison of sequential processing and token-to-token connections will introduce the transformer approach to context.')
    ] },
    { id: 'attend', title: 'Attend', question: 'How do transformers incorporate information across tokens?', scenes: [
      scene('self-attention', 'Introducing Self-Attention', 'Which other tokens are relevant?', 'Connections from one token to other tokens will illustrate which contextual information may be relevant.'),
      scene('qkv', 'Queries, Keys, and Values', 'How attention relationships are calculated.', 'A token diagram will distinguish queries, keys, and values and show their roles in forming attention relationships.'),
      scene('attention-weights', 'Attention Weights', 'Combining information from other tokens.', 'Attention weights will be paired with token information to illustrate a weighted combination.'),
      scene('feed-forward', 'Feed-Forward Networks', 'Transforming contextual representations.', 'A contextual token representation will pass through a feed-forward block to show the next transformation.'),
      scene('layers', 'Transformer Layers', 'Repeating attention and feed-forward processing.', 'Stacked layer blocks will trace repeated attention and feed-forward processing through a transformer.')
    ] },
    { id: 'generate', title: 'Generate', question: 'How does an LLM produce text?', scenes: [
      scene('inside-llm', 'Inside an LLM', 'Tokens, transformer processing, and prediction.', 'An overview will connect input tokens, transformer layers, and the next-token prediction stage.'),
      scene('next-token', 'Predicting the Next Token', 'Candidate tokens and probabilities.', 'Candidate next tokens will appear alongside their predicted probabilities for a shared context.'),
      scene('sampling', 'Temperature and Sampling', 'Why outputs can vary.', 'Contrasting probability distributions and sampling outcomes will show how temperature can affect variation.'),
      scene('response', 'Generating a Response', 'Repeated token prediction.', 'A response will be traced through repeated prediction steps, with each selected token added to the context.'),
      scene('correctness', "Fluent Doesn't Mean Correct", 'The limits of language generation.', 'A fluent response will be paired with evidence checks to distinguish plausible language from factual correctness.')
    ] }
  ];
  const scenes = chapters.flatMap((chapter, chapterIndex) => chapter.scenes.map((item, sceneIndex) => ({ ...item, chapterIndex, sceneIndex })));
  // Navigation is independent of the scene renderer so future visuals can replace this placeholder.
  function nextIndex(index, direction) {
    return direction > 0 && index === scenes.length - 1 ? 0 : Math.max(0, Math.min(scenes.length - 1, index + direction));
  }
  function chapterStart(chapterIndex) { return scenes.findIndex(item => item.chapterIndex === chapterIndex); }
  function isEditable(target) { return target.isContentEditable || Boolean(target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')); }
  if (typeof module !== 'undefined' && module.exports) module.exports = { chapters, scenes, nextIndex, chapterStart, isEditable };
  if (typeof document === 'undefined') return;
  const $ = selector => document.querySelector(selector);
  let activeScene = 0;
  const buttons = chapters.map((chapter, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'chapter'; button.dataset.number = index + 1;
    button.textContent = chapter.title; button.setAttribute('aria-controls', 'scenePanel');
    button.addEventListener('click', () => { activeScene = chapterStart(index); render(); });
    $('.chapter-bar').appendChild(button);
    return button;
  });
  function renderPlaceholder(item, chapter) {
    $('#chapterQuestion').textContent = chapter.question;
    $('#placeholderCopy').textContent = item.placeholder;
    $('#sceneContent').dataset.sceneId = item.id;
  }
  function render() {
    const item = scenes[activeScene], chapter = chapters[item.chapterIndex];
    $('#sceneKicker').textContent = `Chapter ${item.chapterIndex + 1} · ${chapter.title} / Scene ${item.sceneIndex + 1}`;
    $('#sceneTitle').textContent = item.title;
    $('#sceneCopy').textContent = item.description;
    $('#sceneCount').textContent = `Scene ${activeScene + 1} of ${scenes.length}`;
    renderPlaceholder(item, chapter);
    buttons.forEach((button, index) => {
      button.classList.toggle('active', index === item.chapterIndex);
      if (index === item.chapterIndex) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('#prevBtn').disabled = activeScene === 0;
    $('#nextBtn').textContent = activeScene === scenes.length - 1 ? 'Start over' : 'Next →';
    $('.progress').setAttribute('aria-valuenow', activeScene + 1);
    $('.progress').setAttribute('aria-valuetext', `Scene ${activeScene + 1} of ${scenes.length}: ${item.title}`);
    $('#progressFill').style.width = `${(activeScene + 1) / scenes.length * 100}%`;
    $('#liveStatus').textContent = `${chapter.title}. Scene ${activeScene + 1} of ${scenes.length}: ${item.title}`;
  }
  function move(direction) { activeScene = nextIndex(activeScene, direction); render(); }
  $('#prevBtn').addEventListener('click', () => move(-1));
  $('#nextBtn').addEventListener('click', () => move(1));
  $('#restartBtn').addEventListener('click', () => { activeScene = 0; render(); });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditable(event.target)) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
  });
  render();
})();
