"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "fixtures", "gtm-export-sample.json"), "utf8"),
);

const validSpec = {
  specVersion: "1.1",
  measurementId: "G-XXXXXXXXXX",
  events: [{
    eventName: "ui_click",
    trigger: { type: "custom_event", eventName: "ui_click" },
    parameters: [
      { name: "screen_name", valueType: "dataLayerVariable", value: "screen_name" },
      { name: "element_id", valueType: "dataLayerVariable", value: "element_id" },
    ],
  }],
};

const loadBuilder = () => import("../src/builder.mjs");

test("validates the supported custom_event spec", async () => {
  const { validateSpec } = await loadBuilder();
  assert.deepEqual(validateSpec(validSpec), []);
});

test("reports JSON parse failures", async () => {
  const { buildFromJson } = await loadBuilder();
  const result = buildFromJson("{");
  assert.equal(result.output, null);
  assert.match(result.errors[0], /^Invalid JSON:/);
});

test("rejects unconfirmed trigger and parameter structures", async () => {
  const { validateSpec } = await loadBuilder();
  const pageView = structuredClone(validSpec);
  pageView.events[0].trigger = { type: "page_view", eventName: "ui_click" };
  assert.ok(validateSpec(pageView).some((error) => error.includes("only custom_event")));

  const staticValue = structuredClone(validSpec);
  staticValue.events[0].parameters[0].valueType = "static";
  assert.ok(validateSpec(staticValue).some((error) => error.includes("only dataLayerVariable")));
});

test("rejects duplicate events, duplicate parameters, and GTM template input", async () => {
  const { validateSpec } = await loadBuilder();
  const invalid = structuredClone(validSpec);
  invalid.events.push(structuredClone(invalid.events[0]));
  invalid.events[0].parameters.push({
    name: "screen_name",
    valueType: "dataLayerVariable",
    value: "{{screen_name}}",
  });
  const errors = validateSpec(invalid).join("\n");
  assert.match(errors, /duplicate eventName/);
  assert.match(errors, /duplicate parameter name/);
  assert.match(errors, /raw data layer key/);
});

test("transforms a spec into the fixture-backed tag, trigger, and DLV shapes", async () => {
  const { transformSpec } = await loadBuilder();
  const output = transformSpec(validSpec, new Date("2026-08-18T00:00:00Z"));
  const version = output.containerVersion;
  const tag = version.tag[0];
  const trigger = version.trigger[0];
  const find = (parameters, key) => parameters.find((parameter) => parameter.key === key);

  assert.equal(output.exportFormatVersion, 2);
  assert.equal(tag.type, "gaawe");
  assert.equal(find(tag.parameter, "measurementIdOverride").value, "G-XXXXXXXXXX");
  assert.equal(find(tag.parameter, "eventName").value, "ui_click");
  assert.equal(find(tag.parameter, "eventSettingsTable").type, "LIST");
  assert.equal(trigger.type, "CUSTOM_EVENT");
  assert.equal(find(trigger.customEventFilter[0].parameter, "arg0").value, "{{_event}}");
  assert.deepEqual(version.variable.map((variable) => variable.type), ["v", "v"]);
});

test("matches the fixture entity structures for the fixture-equivalent spec", async () => {
  const { transformSpec } = await loadBuilder();
  const fixtureSpec = structuredClone(validSpec);
  fixtureSpec.events[0].parameters.push(
    { name: "element_name", valueType: "dataLayerVariable", value: "element_name" },
    { name: "element_kind", valueType: "dataLayerVariable", value: "element_kind" },
  );
  const actual = transformSpec(fixtureSpec, new Date("2026-08-18T00:00:00Z")).containerVersion;
  const expected = fixture.containerVersion;

  assert.deepEqual(actual.tag, expected.tag);
  assert.deepEqual(actual.trigger, expected.trigger);
  assert.deepEqual(actual.variable, expected.variable);
  assert.deepEqual(actual.builtInVariable, expected.builtInVariable);
});

test("preserves tag-trigger-variable reference integrity and deduplicates DLVs", async () => {
  const { transformSpec } = await loadBuilder();
  const spec = structuredClone(validSpec);
  spec.events.push({
    eventName: "form_submit",
    trigger: { type: "custom_event", eventName: "form_submit" },
    parameters: [{ name: "screen", valueType: "dataLayerVariable", value: "screen_name" }],
  });
  const version = transformSpec(spec).containerVersion;
  const triggerIds = new Set(version.trigger.map((trigger) => trigger.triggerId));
  const variableNames = new Set(version.variable.map((variable) => variable.name));

  for (const tag of version.tag) {
    assert.ok(tag.firingTriggerId.every((id) => triggerIds.has(id)));
    const table = tag.parameter.find((parameter) => parameter.key === "eventSettingsTable");
    for (const row of table.list) {
      const reference = row.map.find((cell) => cell.key === "parameterValue").value;
      assert.ok(variableNames.has(reference.slice(2, -2)));
    }
  }
  assert.equal(version.variable.filter((variable) => variable.name === "DLV - screen_name").length, 1);
});
