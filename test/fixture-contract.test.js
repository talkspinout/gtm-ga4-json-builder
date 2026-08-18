"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fixturePath = path.join(__dirname, "..", "fixtures", "gtm-export-sample.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function findParam(parameters, key) {
  return parameters.find((p) => p.key === key);
}

test("top-level export shape", () => {
  assert.equal(fixture.exportFormatVersion, 2);
  assert.ok(fixture.containerVersion, "containerVersion must be present");
  assert.ok(Array.isArray(fixture.containerVersion.tag));
  assert.ok(Array.isArray(fixture.containerVersion.trigger));
  assert.ok(Array.isArray(fixture.containerVersion.variable));
});

test("GA4 Event tag has expected type and parameters", () => {
  const tag = fixture.containerVersion.tag[0];
  assert.equal(tag.type, "gaawe");

  const measurementId = findParam(tag.parameter, "measurementIdOverride");
  assert.equal(measurementId.type, "TEMPLATE");
  assert.equal(measurementId.value, "G-XXXXXXXXXX");

  const eventName = findParam(tag.parameter, "eventName");
  assert.equal(eventName.type, "TEMPLATE");
  assert.equal(eventName.value, "ui_click");
});

test("eventSettingsTable is a LIST of MAP rows with parameter/parameterValue", () => {
  const tag = fixture.containerVersion.tag[0];
  const table = findParam(tag.parameter, "eventSettingsTable");
  assert.equal(table.type, "LIST");
  assert.ok(table.list.length > 0);

  for (const row of table.list) {
    assert.equal(row.type, "MAP");
    const paramKey = row.map.find((m) => m.key === "parameter");
    const paramValue = row.map.find((m) => m.key === "parameterValue");
    assert.ok(paramKey, "row must have a 'parameter' entry");
    assert.ok(paramValue, "row must have a 'parameterValue' entry");
    assert.equal(paramKey.type, "TEMPLATE");
    assert.equal(paramValue.type, "TEMPLATE");
  }
});

test("tag references trigger by string firingTriggerId", () => {
  const tag = fixture.containerVersion.tag[0];
  const trigger = fixture.containerVersion.trigger[0];
  assert.ok(Array.isArray(tag.firingTriggerId));
  assert.equal(tag.firingTriggerId[0], trigger.triggerId);
  assert.equal(typeof trigger.triggerId, "string");
});

test("Custom Event trigger filters on {{_event}} EQUALS event name", () => {
  const trigger = fixture.containerVersion.trigger[0];
  assert.equal(trigger.type, "CUSTOM_EVENT");

  const filter = trigger.customEventFilter[0];
  assert.equal(filter.type, "EQUALS");

  const arg0 = findParam(filter.parameter, "arg0");
  const arg1 = findParam(filter.parameter, "arg1");
  assert.equal(arg0.value, "{{_event}}");
  assert.equal(typeof arg1.value, "string");
  assert.ok(arg1.value.length > 0);
});

test("DLV variables use type 'v' with dataLayerVersion 2", () => {
  const variables = fixture.containerVersion.variable;
  assert.ok(variables.length > 0);

  for (const variable of variables) {
    assert.equal(variable.type, "v");
    const version = findParam(variable.parameter, "dataLayerVersion");
    const name = findParam(variable.parameter, "name");
    assert.equal(version.value, "2");
    assert.equal(name.type, "TEMPLATE");
  }
});

test("eventSettingsTable DLV references match a defined variable name", () => {
  const tag = fixture.containerVersion.tag[0];
  const table = findParam(tag.parameter, "eventSettingsTable");
  const variableNames = new Set(fixture.containerVersion.variable.map((v) => v.name));

  for (const row of table.list) {
    const paramValue = row.map.find((m) => m.key === "parameterValue").value;
    const match = paramValue.match(/^\{\{(.+)\}\}$/);
    assert.ok(match, `expected template reference, got "${paramValue}"`);
    assert.ok(
      variableNames.has(match[1]),
      `referenced variable "${match[1]}" must exist in containerVersion.variable`
    );
  }
});

test("built-in Event variable is enabled", () => {
  const builtIns = fixture.containerVersion.builtInVariable;
  assert.ok(builtIns.some((b) => b.type === "EVENT" && b.name === "Event"));
});
