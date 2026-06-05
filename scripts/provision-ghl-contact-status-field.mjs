#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const STATUS_OPTIONS = ["Active", "Inactive"];
const STATUS_FIELD = {
  name: "Status",
  dataType: "SINGLE_OPTIONS",
  placeholder: "Active",
  picklistOptions: STATUS_OPTIONS,
  model: "contact",
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

function getCreatedField(response) {
  return response?.customField || response?.field || response?.data?.customField || response?.data?.field || response?.data || response;
}

function isContactStatusField(field) {
  const name = String(field?.name || "").trim().toLowerCase();
  const model = String(field?.model || "").trim().toLowerCase();
  const fieldKey = String(field?.fieldKey || "").trim().toLowerCase();

  return name === "status" && (!model || model === "contact") && (!fieldKey || fieldKey.startsWith("contact."));
}

function getFieldOptions(field) {
  const options = field?.picklistOptions || field?.options || field?.allowedValues || field?.choices || [];
  if (!Array.isArray(options)) return [];

  return options.map((option) =>
    typeof option === "string" ? option : option?.label || option?.value || option?.name || String(option),
  );
}

function hasStatusOptions(field) {
  const normalizedOptions = new Set(getFieldOptions(field).map((option) => option.trim().toLowerCase()));
  return STATUS_OPTIONS.every((option) => normalizedOptions.has(option.toLowerCase()));
}

function isSingleSelectField(field) {
  const dataType = String(field?.dataType || field?.type || "").trim().toUpperCase();
  return ["SINGLE_OPTIONS", "SINGLE_SELECT", "SELECT", "DROPDOWN"].includes(dataType);
}

function pickStatusFieldToKeep(fields) {
  return (
    fields.find((field) => isSingleSelectField(field) && hasStatusOptions(field)) ||
    fields.find((field) => String(field?.fieldKey || "").trim().toLowerCase() === "contact.status") ||
    fields
      .slice()
      .sort((left, right) => Number(left?.position ?? 0) - Number(right?.position ?? 0))[0]
  );
}

function summarizeField(field) {
  return {
    id: field?.id,
    name: field?.name,
    fieldKey: field?.fieldKey,
    dataType: field?.dataType || field?.type,
    model: field?.model,
    position: field?.position,
    picklistOptions: getFieldOptions(field),
  };
}

function getUrl(endpoint) {
  return new URL(endpoint, `${API_BASE_URL.replace(/\/$/, "")}/`).toString();
}

async function ghlRequest(endpoint, { method = "GET", body, token, expectedStatuses = [200, 201] }) {
  const response = await fetch(getUrl(endpoint), {
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
    const message = parsed?.message || parsed?.error || text || `${method} ${endpoint} failed`;
    throw new GhlApiError(message, response.status, parsed);
  }

  return parsed;
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

async function main() {
  const { token, locationId, source } = await resolveCredentials();

  console.log(`Using ${source}`);
  console.log(`GHL location: ${locationId}`);
  console.log(`GHL token: ${mask(token)}`);

  const fieldsResponse = await ghlRequest(
    `/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,
    { token },
  );
  const contactFields = getCollection(fieldsResponse, "customFields");
  console.log(`Contact custom fields before: ${contactFields.length}`);

  const statusFields = contactFields.filter(isContactStatusField);

  if (statusFields.length > 0) {
    console.log(`Contact Status fields found: ${statusFields.length}`);
    console.log(JSON.stringify(statusFields.map(summarizeField), null, 2));
  }

  const statusFieldToKeep = pickStatusFieldToKeep(statusFields);
  if (statusFieldToKeep?.id) {
    console.log(`Updating Contact Status field to Active/Inactive dropdown: ${statusFieldToKeep.id}`);
    let updatedResponse;
    try {
      updatedResponse = await ghlRequest(
        `/locations/${encodeURIComponent(locationId)}/customFields/${encodeURIComponent(statusFieldToKeep.id)}`,
        {
          method: "PUT",
          token,
          body: {
            ...STATUS_FIELD,
            position: statusFieldToKeep.position ?? contactFields.length,
          },
        },
      );
    } catch (error) {
      if (statusFields.length > 1) {
        console.error("GHL refused to update the kept Status field. No duplicate Status fields were deleted.");
      }
      throw error;
    }

    const updatedField = getCreatedField(updatedResponse);
    console.log("Kept Contact Status field:");
    console.log(JSON.stringify(summarizeField({ ...statusFieldToKeep, ...updatedField }), null, 2));

    const duplicateFields = statusFields.filter((field) => field.id && field.id !== statusFieldToKeep.id);
    for (const duplicateField of duplicateFields) {
      console.log(`Deleting duplicate Contact Status field: ${duplicateField.id}`);
      await ghlRequest(
        `/locations/${encodeURIComponent(locationId)}/customFields/${encodeURIComponent(duplicateField.id)}`,
        {
          method: "DELETE",
          token,
          expectedStatuses: [200, 204],
        },
      );
    }
  } else {
    const createResponse = await ghlRequest(
      `/locations/${encodeURIComponent(locationId)}/customFields`,
      {
        method: "POST",
        token,
        body: {
          ...STATUS_FIELD,
          position: contactFields.length,
        },
      },
    );
    const createdField = getCreatedField(createResponse);

    console.log("Created Contact Status field:");
    console.log(JSON.stringify(summarizeField(createdField), null, 2));
  }

  const verifyResponse = await ghlRequest(
    `/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,
    { token },
  );
  const verifiedFields = getCollection(verifyResponse, "customFields");
  const verifiedStatusFields = verifiedFields.filter(isContactStatusField);
  const verifiedStatusField = verifiedStatusFields[0];

  if (!verifiedStatusField) {
    throw new Error("GHL accepted the create request, but Status was not returned in contact custom fields.");
  }

  if (verifiedStatusFields.length !== 1) {
    throw new Error(`Expected one Contact Status field, but found ${verifiedStatusFields.length}.`);
  }

  if (!isSingleSelectField(verifiedStatusField) || !hasStatusOptions(verifiedStatusField)) {
    throw new Error("Contact Status exists, but it is not an Active/Inactive dropdown.");
  }

  console.log(`Contact custom fields after: ${verifiedFields.length}`);
  console.log("Verified Contact Status field:");
  console.log(JSON.stringify(summarizeField(verifiedStatusField), null, 2));
}

main().catch((error) => {
  console.error(error instanceof GhlApiError ? {
    message: error.message,
    status: error.status,
    body: error.body,
  } : error);
  process.exit(1);
});
