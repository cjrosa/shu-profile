const { test } = require("node:test");
const assert = require("node:assert/strict");
const { render } = require("../assets/js/network-explorer-status.js");
test("status shows two labels and pauses the spinner independently of the label", () => {
  const classes = new Set(),
    element = {
      dataset: {},
      innerHTML: "",
      classList: {
        toggle(name, on) {
          if (on) classes.add(name);
          else classes.delete(name);
        },
      },
    };
  render(element);
  assert.equal(element.dataset.label, "Ready");
  assert.ok(!element.innerHTML.includes("<svg"));
  render(element, { active: true });
  assert.equal(element.dataset.label, "Running");
  assert.ok(element.innerHTML.includes("<svg"));
  assert.ok(!classes.has("simulation-paused"));
  render(element, { active: true, paused: true });
  assert.equal(element.dataset.label, "Running");
  assert.ok(classes.has("simulation-paused"));
  render(element, { active: true });
  assert.ok(!classes.has("simulation-paused"));
  render(element);
  assert.equal(element.dataset.label, "Ready");
  assert.ok(!classes.has("simulation-running"));
});
