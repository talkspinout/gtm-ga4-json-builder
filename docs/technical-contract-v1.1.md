# GTM GA4 JSON Builder — Technical Contract v1.1

Source of truth: `fixtures/gtm-export-sample.json` (a sanitized GTM container
export, `exportFormatVersion: 2`). This document records only facts that are
directly observable in that fixture. Anything not covered by the fixture is
listed under "Unconfirmed" rather than guessed.

## Top-level structure

```
{
  exportFormatVersion: 2,
  exportTime: string,
  containerVersion: {
    path, accountId, containerId, containerVersionId,
    container: { path, accountId, containerId, name, publicId, usageContext, features, tagIds },
    tag: [ ... ],
    trigger: [ ... ],
    variable: [ ... ],
    builtInVariable: [ ... ]
  }
}
```

All entity arrays (`tag`, `trigger`, `variable`, `builtInVariable`) live under
`containerVersion`, not at the document root.

## GA4 Event Tag (`tag[].type === "gaawe"`)

Observed fixture tag: `[AI] Tag - ui_click`.

| Field | Type | Observed value | Notes |
|---|---|---|---|
| `type` | string | `"gaawe"` | Identifies a GA4 Event tag |
| `parameter[].key === "measurementIdOverride"` | `TEMPLATE` | `"G-XXXXXXXXXX"` | Literal string in this fixture, **not** a Constant-variable reference (e.g. not `{{GA4 - Measurement ID}}`) |
| `parameter[].key === "eventName"` | `TEMPLATE` | `"ui_click"` | Literal event name |
| `parameter[].key === "sendEcommerceData"` | `BOOLEAN` | `"false"` | Boolean parameters are serialized as the string `"true"`/`"false"` |
| `parameter[].key === "eventSettingsTable"` | `LIST` | see below | Event parameter rows |
| `firingTriggerId` | array of string | `["2"]` | References `trigger[].triggerId` by string ID |
| `tagFiringOption` | string | `"ONCE_PER_EVENT"` | |
| `monitoringMetadata` | object | `{ "type": "MAP" }` | |
| `consentSettings.consentStatus` | string | `"NOT_SET"` | |

### `eventSettingsTable` shape

```
{
  type: "LIST",
  key: "eventSettingsTable",
  list: [
    {
      type: "MAP",
      map: [
        { type: "TEMPLATE", key: "parameter",      value: <event param name> },
        { type: "TEMPLATE", key: "parameterValue",  value: <string, often "{{DLV - <name>}}"> }
      ]
    },
    ...
  ]
}
```

Each row is a `MAP` with exactly two entries, keyed `parameter` and
`parameterValue`. The fixture has 4 rows (`screen_name`, `element_id`,
`element_name`, `element_kind`), each pointing at a same-named DLV variable
reference `{{DLV - <name>}}`.

## Custom Event Trigger (`trigger[].type === "CUSTOM_EVENT"`)

Observed fixture trigger: `[AI] Trigger - ui_click` (`triggerId: "2"`).

```
{
  type: "CUSTOM_EVENT",
  customEventFilter: [
    {
      type: "EQUALS",
      parameter: [
        { type: "TEMPLATE", key: "arg0", value: "{{_event}}" },
        { type: "TEMPLATE", key: "arg1", value: <event name literal> }
      ]
    }
  ]
}
```

The filter compares the built-in `{{_event}}` variable against a literal
event-name string via `EQUALS`. This is the standard GTM shape for "fires on
a specific custom `dataLayer.push` event name".

## Data Layer Variable (`variable[].type === "v"`)

Observed fixture variables: `DLV - screen_name`, `DLV - element_id`,
`DLV - element_name`, `DLV - element_kind`.

```
{
  type: "v",
  parameter: [
    { type: "INTEGER", key: "dataLayerVersion", value: "2" },
    { type: "BOOLEAN", key: "setDefaultValue",   value: "false" },
    { type: "TEMPLATE", key: "name",              value: <dataLayer key> }
  ],
  formatValue: {}
}
```

`dataLayerVersion` is serialized as the string `"2"` (DLV2 / `dataLayer.push`
style, not the legacy `macro` `dataLayerVersion: "1"` form). References to
these variables elsewhere in the container use `{{<variable name>}}`, e.g.
`{{DLV - screen_name}}`.

## Built-in variable

```
{ "type": "EVENT", "name": "Event" }
```

Enabling the `Event` built-in variable is what makes `{{_event}}` resolve
inside `customEventFilter`.

## Cross-references

- Tags reference triggers by **string** ID: `tag[].firingTriggerId[]` must
  equal some `trigger[].triggerId` (string comparison, not numeric).
- Variable references anywhere (`measurementIdOverride`, `parameterValue`,
  etc.) use the `{{<variable name>}}` template syntax and are matched by
  `variable[].name`, not by `variableId`.

## Unconfirmed (not present in the fixture — do not assume)

- `page_view` tag shape (only a custom event tag is present).
- Static (non-DLV) `eventSettingsTable` parameter values.
- Constant-type variables (e.g. a shared `{{GA4 - Measurement ID}}` constant)
  — the fixture only shows a literal `measurementIdOverride`.
- Minimum required fields for `containerVersion` on GTM Import (only one
  fully-populated export has been inspected).
