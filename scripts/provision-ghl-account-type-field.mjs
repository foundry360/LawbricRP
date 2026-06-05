#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE_URL = process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";
const ACCOUNT_TYPE_OPTIONS = [
  "Prospect",
  "Client (Active)",
  "Client (Former)",
  "Referral Partner",
  "Partner",
  "Vendor",
  "Opposing Party",
  "Expert / Witness",
  "Court / Agency",
  "Internal",
];

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

    process.env[key] = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function getEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
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

function getUpdatedField(response) {
  return response?.customField || response?.field || response?.data?.customField || response?.data?.field || response?.data || response;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isAccountTypeField(field) {
  const name = normalize(field?.name || field?.label);
  const fieldKey = normalize(field?.fieldKey || field?.key);
  const model = normalize(field?.model);
  return (
    (name === "account type" || fieldKey.endsWith(".account_type") || fieldKey.endsWith(".account type")) &&
    (!model || model === "contact")
  );
}

function getFieldOptions(field) {
  const options = field?.picklistOptions || field?.options || field?.allowedValues || field?.choices || [];
  if (!Array.isArray(options)) return [];

  return options.map((option) =>
    typeof option === "string" ? option : option?.label || option?.value || option?.name || String(option),
  );
}

function isSingleSelectField(field) {
  const dataType = normalize(field?.dataType || field?.type).toUpperCase();
  return ["SINGLE_OPTIONS", "SINGLE_SELECT", "SELECT", "DROPDOWN"].includes(dataType);
}

function summarizeField(field) {
  return {
    id: field?.id,
    name: field?.name || field?.label,
    fieldKey: field?.fieldKey || field?.key,
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
  const accountTypeFields = contactFields.filter(isAccountTypeField);

  if (accountTypeFields.length === 0) {
    throw new Error("Could not find a contact custom field named Account Type.");
  }

  if (accountTypeFields.length > 1) {
    console.log(`Account Type fields found: ${accountTypeFields.length}`);
    console.log(JSON.stringify(accountTypeFields.map(summarizeField), null, 2));
  }

  const accountTypeField = (
    accountTypeFields.find((field) => isSingleSelectField(field)) ||
    accountTypeFields.slice().sort((left, right) => Number(left?.position ?? 0) - Number(right?.position ?? 0))[0]
  );

  console.log(`Updating Account Type field: ${accountTypeField.id}`);
  const updateResponse = await ghlRequest(
    `/locations/${encodeURIComponent(locationId)}/customFields/${encodeURIComponent(accountTypeField.id)}`,
    {
      method: "PUT",
      token,
      body: {
        name: accountTypeField.name || "Account Type",
        dataType: "SINGLE_OPTIONS",
        placeholder: "Prospect",
        options: ACCOUNT_TYPE_OPTIONS,
        model: "contact",
        position: accountTypeField.position ?? contactFields.length,
      },
    },
  );

  const updatedField = getUpdatedField(updateResponse);
  console.log("Updated Account Type field:");
  console.log(JSON.stringify(summarizeField({ ...accountTypeField, ...updatedField }), null, 2));

  const verifyResponse = await ghlRequest(
    `/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,
    { token },
  );
  const verifiedField =
    getCollection(verifyResponse, "customFields").find((field) => field.id === accountTypeField.id) ||
    getCollection(verifyResponse, "customFields").find(isAccountTypeField);

  const verifiedOptions = getFieldOptions(verifiedField);
  const missingOptions = ACCOUNT_TYPE_OPTIONS.filter(
    (option) => !verifiedOptions.some((verifiedOption) => normalize(verifiedOption) === normalize(option)),
  );

  if (!verifiedField || !isSingleSelectField(verifiedField) || missingOptions.length > 0) {
    throw new Error(`Account Type update verification failed. Missing options: ${missingOptions.join(", ") || "none"}`);
  }

  console.log("Verified Account Type options.");
}

main().catch((error) => {
  console.error(error instanceof GhlApiError ? {
    message: error.message,
    status: error.status,
    body: error.body,
  } : error);
  process.exit(1);
});
