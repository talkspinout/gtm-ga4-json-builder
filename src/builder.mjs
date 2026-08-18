const ALLOWED_TOP_LEVEL_KEYS = new Set(["specVersion", "measurementId", "events"]);
const ALLOWED_EVENT_KEYS = new Set(["eventName", "trigger", "parameters"]);
const ALLOWED_TRIGGER_KEYS = new Set(["type", "eventName"]);
const ALLOWED_PARAMETER_KEYS = new Set(["name", "valueType", "value"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unsupported field`);
  }
}

export function parseSpec(source) {
  try {
    return { value: JSON.parse(source), errors: [] };
  } catch (error) {
    return { value: null, errors: [`Invalid JSON: ${error.message}`] };
  }
}

export function validateSpec(spec) {
  const errors = [];
  if (!isRecord(spec)) return ["Spec must be a JSON object"];

  rejectUnknownKeys(spec, ALLOWED_TOP_LEVEL_KEYS, "$", errors);
  if (spec.specVersion !== "1.1") errors.push('$.specVersion: must equal "1.1"');
  if (typeof spec.measurementId !== "string" || spec.measurementId.trim() === "") {
    errors.push("$.measurementId: must be a non-empty string");
  }
  if (!Array.isArray(spec.events) || spec.events.length === 0) {
    errors.push("$.events: must be a non-empty array");
    return errors;
  }

  const eventNames = new Set();
  spec.events.forEach((event, index) => {
    const path = `$.events[${index}]`;
    if (!isRecord(event)) {
      errors.push(`${path}: must be an object`);
      return;
    }
    rejectUnknownKeys(event, ALLOWED_EVENT_KEYS, path, errors);
    if (typeof event.eventName !== "string" || event.eventName.trim() === "") {
      errors.push(`${path}.eventName: must be a non-empty string`);
    } else if (eventNames.has(event.eventName)) {
      errors.push(`${path}.eventName: duplicate eventName "${event.eventName}"`);
    } else {
      eventNames.add(event.eventName);
    }

    if (!isRecord(event.trigger)) {
      errors.push(`${path}.trigger: must be an object`);
    } else {
      rejectUnknownKeys(event.trigger, ALLOWED_TRIGGER_KEYS, `${path}.trigger`, errors);
      if (event.trigger.type !== "custom_event") {
        errors.push(`${path}.trigger.type: only custom_event is supported`);
      }
      if (event.trigger.eventName !== event.eventName) {
        errors.push(`${path}.trigger.eventName: must match eventName`);
      }
    }

    if (!Array.isArray(event.parameters)) {
      errors.push(`${path}.parameters: must be an array`);
      return;
    }
    const parameterNames = new Set();
    event.parameters.forEach((parameter, parameterIndex) => {
      const parameterPath = `${path}.parameters[${parameterIndex}]`;
      if (!isRecord(parameter)) {
        errors.push(`${parameterPath}: must be an object`);
        return;
      }
      rejectUnknownKeys(parameter, ALLOWED_PARAMETER_KEYS, parameterPath, errors);
      if (typeof parameter.name !== "string" || parameter.name.trim() === "") {
        errors.push(`${parameterPath}.name: must be a non-empty string`);
      } else if (parameterNames.has(parameter.name)) {
        errors.push(`${parameterPath}.name: duplicate parameter name "${parameter.name}"`);
      } else {
        parameterNames.add(parameter.name);
      }
      if (parameter.valueType !== "dataLayerVariable") {
        errors.push(`${parameterPath}.valueType: only dataLayerVariable is supported`);
      }
      if (typeof parameter.value !== "string" || parameter.value.trim() === "") {
        errors.push(`${parameterPath}.value: must be a non-empty data layer key`);
      } else if (parameter.value.includes("{{")) {
        errors.push(`${parameterPath}.value: use a raw data layer key, not GTM template syntax`);
      }
    });
  });
  return errors;
}

const template = (key, value) => ({ type: "TEMPLATE", key, value });

function makeTrigger(event, triggerId) {
  return {
    accountId: "1000000000",
    containerId: "200000000",
    triggerId,
    name: `[AI] Trigger - ${event.eventName}`,
    type: "CUSTOM_EVENT",
    customEventFilter: [{
      type: "EQUALS",
      parameter: [template("arg0", "{{_event}}"), template("arg1", event.eventName)],
    }],
  };
}

function makeTag(spec, event, tagId, triggerId) {
  return {
    accountId: "1000000000",
    containerId: "200000000",
    tagId,
    name: `[AI] Tag - ${event.eventName}`,
    type: "gaawe",
    parameter: [
      { type: "BOOLEAN", key: "sendEcommerceData", value: "false" },
      {
        type: "LIST",
        key: "eventSettingsTable",
        list: event.parameters.map((parameter) => ({
          type: "MAP",
          map: [
            template("parameter", parameter.name),
            template("parameterValue", `{{DLV - ${parameter.value}}}`),
          ],
        })),
      },
      template("eventName", event.eventName),
      template("measurementIdOverride", spec.measurementId),
    ],
    firingTriggerId: [triggerId],
    tagFiringOption: "ONCE_PER_EVENT",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  };
}

function makeVariable(key, variableId) {
  return {
    accountId: "1000000000",
    containerId: "200000000",
    variableId,
    name: `DLV - ${key}`,
    type: "v",
    parameter: [
      { type: "INTEGER", key: "dataLayerVersion", value: "2" },
      { type: "BOOLEAN", key: "setDefaultValue", value: "false" },
      template("name", key),
    ],
    formatValue: {},
  };
}

export function transformSpec(spec, now = new Date()) {
  const errors = validateSpec(spec);
  if (errors.length) throw new TypeError(errors.join("\n"));

  const tag = [];
  const trigger = [];
  const dataLayerKeys = [];
  const seenKeys = new Set();
  let nextId = 1;

  for (const event of spec.events) {
    const tagId = String(nextId++);
    const triggerId = String(nextId++);
    tag.push(makeTag(spec, event, tagId, triggerId));
    trigger.push(makeTrigger(event, triggerId));
    for (const parameter of event.parameters) {
      if (!seenKeys.has(parameter.value)) {
        seenKeys.add(parameter.value);
        dataLayerKeys.push(parameter.value);
      }
    }
  }
  const variable = dataLayerKeys.map((key) => makeVariable(key, String(nextId++)));

  return {
    exportFormatVersion: 2,
    exportTime: now.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
    containerVersion: {
      path: "accounts/1000000000/containers/200000000/versions/0",
      accountId: "1000000000",
      containerId: "200000000",
      containerVersionId: "0",
      container: {
        path: "accounts/1000000000/containers/200000000",
        accountId: "1000000000",
        containerId: "200000000",
        name: "GTM GA4 JSON Builder",
        publicId: "GTM-XXXXXXX",
        usageContext: ["WEB"],
        features: {
          supportUserPermissions: true,
          supportEnvironments: true,
          supportWorkspaces: true,
          supportGtagConfigs: false,
          supportBuiltInVariables: true,
          supportClients: false,
          supportFolders: true,
          supportTags: true,
          supportTemplates: true,
          supportTriggers: true,
          supportVariables: true,
          supportVersions: true,
          supportZones: true,
          supportTransformations: false,
        },
        tagIds: ["GTM-XXXXXXX"],
      },
      tag,
      trigger,
      variable,
      builtInVariable: [{
        accountId: "1000000000",
        containerId: "200000000",
        type: "EVENT",
        name: "Event",
      }],
    },
  };
}

export function buildFromJson(source, now) {
  const parsed = parseSpec(source);
  if (parsed.errors.length) return { output: null, errors: parsed.errors };
  const errors = validateSpec(parsed.value);
  if (errors.length) return { output: null, errors };
  return { output: transformSpec(parsed.value, now), errors: [] };
}
