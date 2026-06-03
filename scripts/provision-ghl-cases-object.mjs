#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const DRY_RUN = process.argv.includes("--dry-run");
const INSPECT_ONLY = process.argv.includes("--inspect");

const CASES = {
  objectKey: "custom_objects.cases",
  objectSlug: "cases",
  labels: { singular: "Case", plural: "Cases" },
  description: "Legal case records for Lawbric.",
  fieldName: "Case ID",
  fieldSlug: "case_id",
  schemaFieldKey: "custom_objects.cases.case_id",
  customFieldObjectKey: "custom_object.cases",
  customFieldKey: "custom_object.cases.case_id",
  associationKey: "case_contact",
  association: {
    firstObjectLabel: "Case",
    firstObjectKey: "custom_objects.cases",
    secondObjectLabel: "Contact",
    secondObjectKey: "contact",
  },
};

class GhlApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "GhlApiError";
    this.status = status;
    this.body = body;
  }
}

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const contents = readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;

    const rawValue = valueParts.join("=").trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function getEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key].trim();
  }
  return "";
}

function mask(value) {
  if (!value) return "";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getCollection(response, ...keys) {
  if (Array.isArray(response)) return response;
  for (const key of keys) {
    if (Array.isArray(response?.[key])) return response[key];
    if (Array.isArray(response?.data?.[key])) return response.data[key];
  }
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function hasCaseIdField(schema) {
  const fields = getCollection(schema, "fields", "customFields", "properties");
  return fields.some((field) => {
    const fieldName = String(field.name || field.label || "").trim().toLowerCase();
    const fieldKey = String(field.fieldKey || field.key || "").trim().toLowerCase();
    return fieldName === "case id" || fieldKey === CASES.schemaFieldKey || fieldKey === CASES.customFieldKey;
  });
}

function getSchemaObject(schema) {
  return schema?.object || schema?.data?.object || schema;
}

function getSchemaFields(schema) {
  return getCollection(schema, "fields", "customFields", "properties");
}

function printCasesSchemaSummary(schema) {
  const object = getSchemaObject(schema);
  const fields = getSchemaFields(schema);

  console.log("Cases object schema summary:");
  console.log(JSON.stringify({
    id: object?.id,
    key: object?.key,
    labels: object?.labels,
    locationId: object?.locationId,
    primaryDisplayProperty: object?.primaryDisplayProperty,
    fieldCount: fields.length,
    fields: fields.map((field) => ({
      id: field.id,
      name: field.name || field.label,
      key: field.key,
      fieldKey: field.fieldKey,
      objectKey: field.objectKey,
      dataType: field.dataType || field.type,
      parentId: field.parentId,
    })),
  }, null, 2));
}

function getAssociations(response) {
  const associations = getCollection(response, "associations");
  if (associations.length > 0) return associations;
  if (response?.association && typeof response.association === "object") return [response.association];
  if (response?.data?.association && typeof response.data.association === "object") return [response.data.association];
  if (response?.id && response?.firstObjectKey && response?.secondObjectKey) return [response];
  return [];
}

function isCasesContactAssociation(association) {
  const firstObjectKey = String(association.firstObjectKey || "").toLowerCase();
  const secondObjectKey = String(association.secondObjectKey || "").toLowerCase();
  const associationKey = String(association.key || "").toLowerCase();

  return (
    associationKey === CASES.associationKey ||
    firstObjectKey === CASES.association.firstObjectKey && secondObjectKey === CASES.association.secondObjectKey ||
    firstObjectKey === CASES.association.secondObjectKey && secondObjectKey === CASES.association.firstObjectKey
  );
}

function printAssociationSummary(response) {
  const associations = getAssociations(response);
  const matchingAssociations = associations.filter(isCasesContactAssociation);

  console.log("Cases/contact association summary:");
  console.log(JSON.stringify({
    associationCount: associations.length,
    matchingAssociationCount: matchingAssociations.length,
    matchingAssociations: matchingAssociations.map((association) => ({
      id: association.id,
      key: association.key,
      firstObjectLabel: association.firstObjectLabel,
      firstObjectKey: association.firstObjectKey,
      secondObjectLabel: association.secondObjectLabel,
      secondObjectKey: association.secondObjectKey,
      associationType: association.associationType,
    })),
  }, null, 2));
}

async function resolveCredentialsFromSupabase() {
  const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let query = supabase
    .from("ghl_locations")
    .select("id, name, ghl_location_id, encrypted_api_key, created_at")
    .not("ghl_location_id", "is", null)
    .not("encrypted_api_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const requestedLocationId = getEnv("SUPABASE_LOCATION_ID", "LAWBRIC_SUPABASE_LOCATION_ID");
  if (requestedLocationId) query = query.eq("id", requestedLocationId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load GHL credentials from Supabase: ${error.message}`);

  const location = data?.[0];
  if (!location?.ghl_location_id || !location?.encrypted_api_key) return null;

  return {
    token: location.encrypted_api_key,
    locationId: location.ghl_location_id,
    source: `Supabase location ${location.name || location.id}`,
  };
}

async function resolveCredentials() {
  const token = getEnv("GHL_PRIVATE_INTEGRATION_API_KEY", "GHL_PRIVATE_INTEGRATION_TOKEN", "GHL_API_KEY");
  const locationId = getEnv("GHL_LOCATION_ID", "GHL_SUBACCOUNT_LOCATION_ID");

  if (token && locationId) {
    return { token, locationId, source: "GHL_* environment variables" };
  }

  const supabaseCredentials = await resolveCredentialsFromSupabase();
  if (supabaseCredentials) return supabaseCredentials;

  throw new Error(
    [
      "Missing GHL credentials.",
      "Set GHL_PRIVATE_INTEGRATION_API_KEY and GHL_LOCATION_ID,",
      "or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY so the script can read ghl_locations.",
    ].join(" "),
  );
}

function getUrl(endpoint) {
  return new URL(endpoint, `${API_BASE_URL.replace(/\/$/, "")}/`).toString();
}

async function ghlRequest(endpoint, { method = "GET", body, token, expectedStatuses = [200, 201] }) {
  const url = getUrl(endpoint);
  const label = `${method} ${endpoint}`;

  if (DRY_RUN && method === "GET") {
    console.log(`[dry-run] ${label}`);
    return {};
  }

  if (DRY_RUN && method !== "GET") {
    console.log(`[dry-run] ${label}`);
    if (body) console.log(JSON.stringify(body, null, 2));
    if (endpoint === "/custom-fields/folder") return { folder: { id: "dry-run-folder-id" } };
    if (endpoint === "/objects/") return { object: { key: CASES.objectKey } };
    if (endpoint === "/associations/") return { association: { key: CASES.associationKey, ...CASES.association } };
    return {};
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Version: API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!expectedStatuses.includes(response.status)) {
    const message = parsed?.message || parsed?.error || text || `${label} failed`;
    throw new GhlApiError(message, response.status, parsed);
  }

  return parsed;
}

async function findExistingCasesObject(token, locationId) {
  const response = await ghlRequest(`/objects/?locationId=${encodeURIComponent(locationId)}`, { token });
  const objects = getCollection(response, "objects");
  return objects.find((object) => {
    const key = String(object.key || "").toLowerCase();
    const singular = String(object.labels?.singular || object.label || "").toLowerCase();
    const plural = String(object.labels?.plural || "").toLowerCase();
    return key === CASES.objectKey || key === CASES.objectSlug || singular === "case" || plural === "cases";
  });
}

async function getCasesSchema(token, locationId, key = CASES.objectKey) {
  return ghlRequest(
    `/objects/${encodeURIComponent(key)}?locationId=${encodeURIComponent(locationId)}&fetchProperties=true`,
    { token },
  );
}

async function tryReadCasesCustomFields(token, locationId) {
  try {
    return await ghlRequest(
      `/custom-fields/object-key/${encodeURIComponent(CASES.objectKey)}?locationId=${encodeURIComponent(locationId)}`,
      { token },
    );
  } catch (error) {
    if (error instanceof GhlApiError) {
      console.warn(`Could not read custom fields by object key (${error.status}): ${error.message}`);
      return null;
    }
    throw error;
  }
}

async function tryReadCasesAssociations(token, locationId) {
  try {
    return await ghlRequest(
      `/associations/objectKey/${encodeURIComponent(CASES.objectKey)}?locationId=${encodeURIComponent(locationId)}`,
      { token },
    );
  } catch (error) {
    if (error instanceof GhlApiError) {
      console.warn(`Could not read associations by object key (${error.status}): ${error.message}`);
      return null;
    }
    throw error;
  }
}

function getCreateObjectBody() {
  return {
    key: CASES.objectSlug,
    labels: CASES.labels,
    description: CASES.description,
    locationId: undefined,
    primaryDisplayPropertyDetails: {
      key: CASES.fieldSlug,
      name: CASES.fieldName,
      dataType: "TEXT",
    },
  };
}

async function createCasesObject(token, locationId) {
  const attempts = [
    { name: "object schema with Case ID primary display field", body: getCreateObjectBody() },
  ];

  for (const attempt of attempts) {
    try {
      const body = { ...attempt.body, locationId };
      console.log(`Creating Cases custom object (${attempt.name})...`);
      return await ghlRequest("/objects/", { method: "POST", token, body });
    } catch (error) {
      if (!(error instanceof GhlApiError)) throw error;
      console.warn(`Create attempt failed (${error.status}): ${error.message}`);
    }
  }

  throw new Error("Could not create the Cases custom object with the supported request shapes.");
}

async function createCaseIdCustomField(token, locationId) {
  const parentId = getEnv("GHL_CASES_FIELD_FOLDER_ID");
  let folderId = parentId;

  if (!folderId) {
    console.log("Creating Case Details custom field folder...");
    const folder = await ghlRequest("/custom-fields/folder", {
      method: "POST",
      token,
      body: {
        objectKey: CASES.customFieldObjectKey,
        name: "Case Details",
        locationId,
      },
    });
    folderId = folder?.folder?.id || folder?.id;
  }

  if (!folderId) {
    throw new Error("GHL did not return a custom field folder id. Set GHL_CASES_FIELD_FOLDER_ID and rerun.");
  }

  console.log("Creating Case ID custom field...");
  return ghlRequest("/custom-fields/", {
    method: "POST",
    token,
    body: {
      locationId,
      name: CASES.fieldName,
      dataType: "TEXT",
      fieldKey: CASES.customFieldKey,
      objectKey: CASES.customFieldObjectKey,
      parentId: folderId,
      showInForms: true,
    },
  });
}

async function ensureCasesContactAssociation(token, locationId) {
  const associations = await tryReadCasesAssociations(token, locationId);
  if (associations && getAssociations(associations).some(isCasesContactAssociation)) {
    console.log("Cases/contact association already exists.");
    return;
  }

  console.log("Creating Cases/contact association...");
  try {
    await ghlRequest("/associations/", {
      method: "POST",
      token,
      body: {
        locationId,
        key: CASES.associationKey,
        ...CASES.association,
      },
    });
  } catch (error) {
    if (error instanceof GhlApiError && String(error.message).toLowerCase().includes("already")) {
      console.log("Cases/contact association already exists.");
      return;
    }

    throw error;
  }

  console.log("Cases/contact association created.");
}

async function main() {
  const { token, locationId, source } = await resolveCredentials();

  console.log(`Using ${source}`);
  console.log(`GHL location: ${locationId}`);
  console.log(`GHL token: ${mask(token)}`);

  const existing = DRY_RUN ? null : await findExistingCasesObject(token, locationId);

  if (existing) {
    console.log(`Cases object already exists: ${existing.key || existing.id}`);
    const schema = await getCasesSchema(token, locationId, existing.key || CASES.objectKey);
    printCasesSchemaSummary(schema);

    if (INSPECT_ONLY) {
      const customFields = await tryReadCasesCustomFields(token, locationId);
      if (customFields) {
        console.log("Custom fields object-key endpoint summary:");
        console.log(JSON.stringify({
          fieldCount: getSchemaFields(customFields).length,
          fields: getSchemaFields(customFields).map((field) => ({
            id: field.id,
            name: field.name || field.label,
            fieldKey: field.fieldKey,
            objectKey: field.objectKey,
            dataType: field.dataType || field.type,
          })),
        }, null, 2));
      }
      const associations = await tryReadCasesAssociations(token, locationId);
      if (associations) printAssociationSummary(associations);
      return;
    }

    if (hasCaseIdField(schema)) {
      console.log("Case ID field already exists.");
      await ensureCasesContactAssociation(token, locationId);
      return;
    }

    await createCaseIdCustomField(token, locationId);
    console.log("Case ID field created.");
    await ensureCasesContactAssociation(token, locationId);
    return;
  }

  await createCasesObject(token, locationId);

  const schema = DRY_RUN ? null : await getCasesSchema(token, locationId);
  if (schema) printCasesSchemaSummary(schema);

  if (INSPECT_ONLY) return;

  if (schema && hasCaseIdField(schema)) {
    console.log("Cases object created with Case ID field.");
    await ensureCasesContactAssociation(token, locationId);
    return;
  }

  await createCaseIdCustomField(token, locationId);
  console.log("Cases object and Case ID field created.");
  await ensureCasesContactAssociation(token, locationId);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof GhlApiError && error.body) {
    console.error(JSON.stringify(error.body, null, 2));
    if (error.status === 401 || error.status === 403) {
      console.error(
        [
          "Required GHL Private Integration Token scopes:",
          "- objects/schema.readonly",
          "- objects/schema.write",
          "- locations/customFields.readonly",
          "- locations/customFields.write",
          "- associations.readonly",
          "- associations.write",
        ].join("\n"),
      );
    }
  }
  process.exit(1);
});
