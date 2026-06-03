#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const DRY_RUN = process.argv.includes("--dry-run");

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

  if (DRY_RUN && method !== "GET") {
    console.log(`[dry-run] ${label}`);
    if (body) console.log(JSON.stringify(body, null, 2));
    if (endpoint === "/custom-fields/folder") return { folder: { id: "dry-run-folder-id" } };
    if (endpoint === "/objects/") return { object: { key: CASES.objectKey } };
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

async function main() {
  const { token, locationId, source } = await resolveCredentials();

  console.log(`Using ${source}`);
  console.log(`GHL location: ${locationId}`);
  console.log(`GHL token: ${mask(token)}`);

  const existing = DRY_RUN ? null : await findExistingCasesObject(token, locationId);

  if (existing) {
    console.log(`Cases object already exists: ${existing.key || existing.id}`);
    const schema = await getCasesSchema(token, locationId, existing.key || CASES.objectKey);
    if (hasCaseIdField(schema)) {
      console.log("Case ID field already exists. Nothing to create.");
      return;
    }

    await createCaseIdCustomField(token, locationId);
    console.log("Case ID field created.");
    return;
  }

  await createCasesObject(token, locationId);

  const schema = DRY_RUN ? null : await getCasesSchema(token, locationId);
  if (schema && hasCaseIdField(schema)) {
    console.log("Cases object created with Case ID field.");
    return;
  }

  await createCaseIdCustomField(token, locationId);
  console.log("Cases object and Case ID field created.");
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
        ].join("\n"),
      );
    }
  }
  process.exit(1);
});
