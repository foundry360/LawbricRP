import {
  apiClient,
  getAppLocationContext,
  getCustomFields,
  getOpportunities,
  requirePermission,
  updateContact,
  type GhlOpportunity,
  type GhlPipeline,
} from "@/lib/api";
import { createCase, type CaseRecord } from "@/lib/cases";
import { supabase } from "@/lib/supabase";

export const LEAD_ACCOUNT_TYPE = "Lead";
export const CLIENT_ACCOUNT_TYPE = "Client (Active)";

export type LeadRecord = {
  id: string;
  location_id: string;
  lead_name: string;
  status: string;
  stage: string;
  ghl_contact_id: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  assigned_user_id?: string | null;
  ghl_pipeline_id?: string | null;
  ghl_pipeline_stage_id?: string | null;
  ghl_opportunity_id?: string | null;
  ghl_opportunity_name?: string | null;
  converted_case_id?: string | null;
  converted_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LeadInput = {
  locationId: string;
  leadName?: string;
  status?: string;
  stage?: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  assignedUserId?: string | null;
  ghlPipelineId?: string | null;
  ghlPipelineStageId?: string | null;
  ghlOpportunityId?: string | null;
  metadata?: Record<string, unknown>;
};

function getOpportunityId(response: any) {
  return response?.opportunity?.id || response?.data?.id || response?.id || "";
}

function getLeadDisplayName(input: Pick<LeadInput, "leadName" | "contactName" | "contactEmail" | "contactId">) {
  return (input.contactName || input.leadName || input.contactEmail || input.contactId).trim();
}

function normalizeCustomFieldLookup(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[._-]+/g, " ");
}

function customFieldMatchesName(field: any, name: string) {
  const normalizedName = normalizeCustomFieldLookup(name);
  return [field?.name, field?.label, field?.fieldName, field?.fieldKey, field?.key]
    .map((value) => normalizeCustomFieldLookup(value))
    .some((value) => value === normalizedName || value.endsWith(` ${normalizedName}`));
}

function getCustomFieldPayload(field: any, value: string) {
  return {
    ...(field.id ? { id: field.id } : {}),
    ...(field.fieldKey ? { key: field.fieldKey } : {}),
    field_value: value,
  };
}

async function updateContactAccountType(contactId: string, accountType: string) {
  const context = await getAppLocationContext();
  const ghlLocationId = context.location?.ghlLocationId || "";
  if (!ghlLocationId || !contactId) return;

  const response = await getCustomFields(ghlLocationId);
  const customFields = Array.isArray(response)
    ? response
    : Array.isArray(response?.customFields)
      ? response.customFields
      : Array.isArray((response as any)?.data?.customFields)
        ? (response as any).data.customFields
        : [];
  const accountTypeField = customFields.find((field: any) => customFieldMatchesName(field, "account type"));
  if (!accountTypeField) return;

  await updateContact(contactId, {
    customFields: [getCustomFieldPayload(accountTypeField, accountType)],
  });
}

async function syncLeadOpportunity(input: LeadInput, existingOpportunityId?: string | null) {
  const context = await getAppLocationContext();
  const ghlLocationId = context.location?.ghlLocationId || "";
  if (!ghlLocationId || !input.contactId || !input.ghlPipelineId || !input.ghlPipelineStageId) {
    return { opportunityId: existingOpportunityId || "", opportunityName: getLeadDisplayName(input) };
  }

  const opportunityName = getLeadDisplayName(input);
  const createBody = {
    locationId: ghlLocationId,
    contactId: input.contactId,
    name: opportunityName,
    pipelineId: input.ghlPipelineId,
    pipelineStageId: input.ghlPipelineStageId,
    status: input.status === "converted" ? "won" : input.status === "lost" ? "lost" : "open",
  };

  if (existingOpportunityId) {
    await apiClient(`/opportunities/${encodeURIComponent(existingOpportunityId)}`, {
      method: "PUT",
      body: JSON.stringify({
        pipelineId: input.ghlPipelineId,
        pipelineStageId: input.ghlPipelineStageId,
        status: input.status === "converted" ? "won" : input.status === "lost" ? "lost" : "open",
      }),
    });
    return { opportunityId: existingOpportunityId, opportunityName };
  }

  const response = await apiClient("/opportunities/", {
    method: "POST",
    body: JSON.stringify(createBody),
  });

  return { opportunityId: getOpportunityId(response), opportunityName };
}

export async function listLeads(locationId: string) {
  if (!locationId) return [];

  const { data, error } = await supabase
    .from("lead_opportunities")
    .select("*")
    .eq("location_id", locationId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as LeadRecord[];
}

function getContactId(contact: any) {
  return String(contact?.id || contact?._id || contact?.contactId || "");
}

function getContactName(contact: any) {
  return String(
    `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() ||
      contact?.name ||
      contact?.fullName ||
      contact?.email ||
      "",
  );
}

function getContactEmail(contact: any) {
  return contact?.email || contact?.primaryEmail || "";
}

function getContactPhone(contact: any) {
  return contact?.phone || contact?.phoneNumber || contact?.primaryPhone || "";
}

function getOpportunityStageName(opportunity: GhlOpportunity, pipeline?: GhlPipeline) {
  return pipeline?.stages?.find((stage) => stage.id === opportunity.pipelineStageId)?.name || "Pipeline";
}

function normalizeLeadStatusFromOpportunity(status?: string | null) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (normalizedStatus === "won") return "converted";
  if (normalizedStatus === "lost") return "lost";
  return "open";
}

async function findExistingLead(locationId: string, opportunity: GhlOpportunity) {
  const { data: byOpportunityId, error: byOpportunityError } = await supabase
    .from("lead_opportunities")
    .select("*")
    .eq("location_id", locationId)
    .eq("ghl_opportunity_id", opportunity.id)
    .limit(1);

  if (byOpportunityError) throw new Error(byOpportunityError.message);
  if (byOpportunityId?.[0]) return byOpportunityId[0] as LeadRecord;

  const { data: byContact, error: byContactError } = await supabase
    .from("lead_opportunities")
    .select("*")
    .eq("location_id", locationId)
    .eq("ghl_contact_id", opportunity.contactId)
    .eq("ghl_pipeline_id", opportunity.pipelineId)
    .limit(1);

  if (byContactError) throw new Error(byContactError.message);
  return (byContact?.[0] || null) as LeadRecord | null;
}

async function upsertLeadFromOpportunity(
  locationId: string,
  opportunity: GhlOpportunity,
  pipeline: GhlPipeline,
  contactMap: Map<string, any>,
) {
  const contact = contactMap.get(opportunity.contactId);
  const contactName = getContactName(contact) || opportunity.contactName || opportunity.name;
  const contactEmail = getContactEmail(contact) || opportunity.contactEmail || "";
  const contactPhone = getContactPhone(contact) || opportunity.contactPhone || "";
  const stageName = getOpportunityStageName(opportunity, pipeline);
  const existingLead = await findExistingLead(locationId, opportunity);
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    lead_name: contactName || opportunity.name,
    status: normalizeLeadStatusFromOpportunity(opportunity.status) || existingLead?.status || "open",
    stage: stageName,
    ghl_contact_id: opportunity.contactId,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    ghl_pipeline_id: opportunity.pipelineId || pipeline.id,
    ghl_pipeline_stage_id: opportunity.pipelineStageId || null,
    ghl_opportunity_id: opportunity.id,
    ghl_opportunity_name: opportunity.name,
    metadata: {
      ...(existingLead?.metadata || {}),
      source: "ghl_pipeline_sync",
      ghl_pipeline_name: pipeline.name,
      ghl_pipeline_stage_name: stageName,
      ghl_opportunity_synced_at: new Date().toISOString(),
    },
    updated_by: user?.id || null,
  };

  if (existingLead?.id) {
    const { data, error } = await supabase
      .from("lead_opportunities")
      .update(payload)
      .eq("id", existingLead.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as LeadRecord;
  }

  const { data, error } = await supabase
    .from("lead_opportunities")
    .insert({
      location_id: locationId,
      ...payload,
      created_by: user?.id || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as LeadRecord;
}

export async function syncGhlLeadPipelineOpportunities(
  locationId: string,
  ghlLocationId: string,
  pipelines: GhlPipeline[],
  contacts: any[],
) {
  if (!locationId || !ghlLocationId || pipelines.length === 0) return [] as LeadRecord[];

  const contactMap = new Map<string, any>(
    contacts
      .map((contact) => [getContactId(contact), contact] as const)
      .filter(([contactId]) => Boolean(contactId)),
  );
  const syncedLeads: LeadRecord[] = [];

  for (const pipeline of pipelines) {
    const opportunities = await getOpportunities(ghlLocationId, { pipelineId: pipeline.id, limit: 100 });
    for (const opportunity of opportunities) {
      syncedLeads.push(await upsertLeadFromOpportunity(locationId, opportunity, pipeline, contactMap));
    }
  }

  return syncedLeads;
}

export async function ensureLeadContactsHaveOpportunities(
  locationId: string,
  contacts: any[],
  existingLeads: LeadRecord[],
  defaultPipeline?: GhlPipeline | null,
) {
  const defaultStage = defaultPipeline?.stages?.[0];
  if (!locationId || contacts.length === 0 || !defaultPipeline || !defaultStage) return [] as LeadRecord[];

  const ensuredLeads: LeadRecord[] = [];
  const existingLeadsByContactId = new Map(
    existingLeads
      .filter((lead) => lead.status !== "converted")
      .map((lead) => [lead.ghl_contact_id, lead]),
  );

  for (const contact of contacts) {
    const contactId = getContactId(contact);
    if (!contactId) continue;

    const existingLead = existingLeadsByContactId.get(contactId);
    if (existingLead?.ghl_opportunity_id) continue;

    const input: LeadInput = {
      locationId,
      contactId,
      contactName: getContactName(contact),
      contactEmail: getContactEmail(contact),
      contactPhone: getContactPhone(contact),
      status: "open",
      stage: defaultStage.name,
      ghlPipelineId: defaultPipeline.id,
      ghlPipelineStageId: defaultStage.id,
      metadata: {
        ...(existingLead?.metadata || {}),
        source: existingLead ? "lead_contact_opportunity_update" : "lead_contact_opportunity_create",
      },
    };

    ensuredLeads.push(existingLead ? await updateLead(existingLead.id, input) : await createLead(input));
  }

  return ensuredLeads;
}

export async function createLead(input: LeadInput) {
  await requirePermission("leads.create", "You do not have permission to create leads.");
  const { data: { user } } = await supabase.auth.getUser();
  const leadName = getLeadDisplayName(input);
  await updateContactAccountType(input.contactId, LEAD_ACCOUNT_TYPE);
  const opportunity = await syncLeadOpportunity(input);
  const metadata = {
    ...(input.metadata || {}),
    ...(opportunity.opportunityId ? { ghl_opportunity_synced_at: new Date().toISOString() } : {}),
  };

  const { data, error } = await supabase
    .from("lead_opportunities")
    .insert({
      location_id: input.locationId,
      lead_name: leadName,
      status: input.status || "open",
      stage: input.stage || "new",
      ghl_contact_id: input.contactId,
      contact_name: input.contactName || null,
      contact_email: input.contactEmail || null,
      contact_phone: input.contactPhone || null,
      assigned_user_id: input.assignedUserId || null,
      ghl_pipeline_id: input.ghlPipelineId || null,
      ghl_pipeline_stage_id: input.ghlPipelineStageId || null,
      ghl_opportunity_id: opportunity.opportunityId || input.ghlOpportunityId || null,
      ghl_opportunity_name: opportunity.opportunityName || leadName,
      metadata,
      created_by: user?.id || null,
      updated_by: user?.id || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as LeadRecord;
}

export async function updateLead(leadId: string, input: Partial<LeadInput>) {
  await requirePermission("leads.edit", "You do not have permission to edit leads.");
  const { data: existing, error: existingError } = await supabase
    .from("lead_opportunities")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Lead not found");

  const merged: LeadInput = {
    locationId: existing.location_id,
    leadName: input.leadName ?? existing.lead_name,
    status: input.status ?? existing.status,
    stage: input.stage ?? existing.stage,
    contactId: input.contactId ?? existing.ghl_contact_id,
    contactName: input.contactName ?? existing.contact_name ?? "",
    contactEmail: input.contactEmail ?? existing.contact_email ?? "",
    contactPhone: input.contactPhone ?? existing.contact_phone ?? "",
    assignedUserId: input.assignedUserId ?? existing.assigned_user_id ?? null,
    ghlPipelineId: input.ghlPipelineId ?? existing.ghl_pipeline_id ?? null,
    ghlPipelineStageId: input.ghlPipelineStageId ?? existing.ghl_pipeline_stage_id ?? null,
    ghlOpportunityId: existing.ghl_opportunity_id,
    metadata: { ...(existing.metadata || {}), ...(input.metadata || {}) },
  };
  const leadName = getLeadDisplayName(merged);
  await updateContactAccountType(merged.contactId, LEAD_ACCOUNT_TYPE);
  const opportunity = await syncLeadOpportunity(merged, existing.ghl_opportunity_id);

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("lead_opportunities")
    .update({
      lead_name: leadName,
      status: merged.status || "open",
      stage: merged.stage || "new",
      ghl_contact_id: merged.contactId,
      contact_name: merged.contactName || null,
      contact_email: merged.contactEmail || null,
      contact_phone: merged.contactPhone || null,
      assigned_user_id: merged.assignedUserId || null,
      ghl_pipeline_id: merged.ghlPipelineId || null,
      ghl_pipeline_stage_id: merged.ghlPipelineStageId || null,
      ghl_opportunity_id: opportunity.opportunityId || null,
      ghl_opportunity_name: opportunity.opportunityName || leadName,
      metadata: merged.metadata,
      updated_by: user?.id || null,
    })
    .eq("id", leadId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as LeadRecord;
}

export async function deleteLead(leadId: string) {
  await requirePermission("leads.delete", "You do not have permission to delete leads.");
  const { error } = await supabase.from("lead_opportunities").delete().eq("id", leadId);
  if (error) throw new Error(error.message);
}

export async function convertLeadToMatter(lead: LeadRecord) {
  await requirePermission("leads.convert", "You do not have permission to convert leads.");
  const convertedAt = new Date().toISOString();
  const matter = await createCase({
    locationId: lead.location_id,
    caseName: lead.lead_name,
    caseType: String(lead.metadata?.case_type || "General"),
    status: "open",
    stage: "intake",
    contactId: lead.ghl_contact_id,
    contactName: lead.contact_name || "",
    contactEmail: lead.contact_email || "",
    contactPhone: lead.contact_phone || "",
    assignedUserId: lead.assigned_user_id || null,
    metadata: {
      source: "lead_conversion",
      lead_id: lead.id,
      ghl_opportunity_id: lead.ghl_opportunity_id || null,
    },
  }) as CaseRecord;

  if (lead.ghl_opportunity_id) {
    await apiClient(`/opportunities/${encodeURIComponent(lead.ghl_opportunity_id)}`, {
      method: "PUT",
      body: JSON.stringify({
        ...(lead.ghl_pipeline_id ? { pipelineId: lead.ghl_pipeline_id } : {}),
        ...(lead.ghl_pipeline_stage_id ? { pipelineStageId: lead.ghl_pipeline_stage_id } : {}),
        status: "won",
      }),
    });
  }

  await updateContactAccountType(lead.ghl_contact_id, CLIENT_ACCOUNT_TYPE);

  const { data, error } = await supabase
    .from("lead_opportunities")
    .update({
      status: "converted",
      converted_case_id: matter.id,
      converted_at: convertedAt,
      metadata: {
        ...(lead.metadata || {}),
        converted_case_id: matter.id,
        converted_at: convertedAt,
      },
    })
    .eq("id", lead.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { lead: data as LeadRecord, matter };
}
