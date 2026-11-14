/* Status presentation consumes flags, never parses user-facing labels. */
(function (root) {
  "use strict";
  function render(element, { active = false, paused = false } = {}) {
    element.classList.toggle("simulation-running", active);
    element.classList.toggle("simulation-paused", paused);
    const label = active ? "Running" : "Ready";
    if (element.dataset.label === label) return;
    element.dataset.label = label;
    element.innerHTML =
      (active
        ? '<svg class="simulation-spinner" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 7 7"/></svg>'
        : "") +
      "<span>" +
      label +
      "</span>";
  }
  root.NetworkExplorerStatus = { render };
  if (typeof module !== "undefined") module.exports = { render };
})(globalThis);
