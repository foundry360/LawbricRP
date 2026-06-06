import { supabase } from "@/lib/supabase";

export type PipelineClassification = "unclassified" | "prospecting" | "matter";

export type PipelineConfig = {
  id: string;
  location_id: string;
  ghl_pipeline_id: string;
  name_snapshot: string;
  classification: PipelineClassification;
  account_type_rule?: string | null;
  include_tags: string[];
  exclude_tags: string[];
  is_active: boolean;
  display_order: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineConfigInput = {
  locationId: string;
  ghlPipelineId: string;
  nameSnapshot: string;
  classification: PipelineClassification;
  accountTypeRule?: string | null;
  includeTags?: string[];
  excludeTags?: string[];
  isActive?: boolean;
  displayOrder?: number | null;
  notes?: string | null;
};

export type PipelineConfigListResult = {
  configs: PipelineConfig[];
  supportsDisplayOrder: boolean;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "";
}

export function isMissingPipelineDisplayOrderError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("display_order") && (
    message.includes("column") && message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function normalizePipelineConfig(row: Partial<PipelineConfig>): PipelineConfig {
  return {
    ...row,
    display_order: row.display_order ?? 0,
  } as PipelineConfig;
}

export async function listPipelineConfigsWithMetadata(locationId: string): Promise<PipelineConfigListResult> {
  if (!locationId) return { configs: [], supportsDisplayOrder: true };

  const orderedResponse = await supabase
    .from("ghl_pipeline_configs")
    .select("*")
    .eq("location_id", locationId)
    .order("display_order", { ascending: true })
    .order("name_snapshot", { ascending: true });

  if (!orderedResponse.error) {
    return {
      configs: (orderedResponse.data || []).map(normalizePipelineConfig),
      supportsDisplayOrder: true,
    };
  }

  if (!isMissingPipelineDisplayOrderError(orderedResponse.error)) {
    throw new Error(orderedResponse.error.message);
  }

  const fallbackResponse = await supabase
    .from("ghl_pipeline_configs")
    .select("*")
    .eq("location_id", locationId)
    .order("name_snapshot", { ascending: true });

  if (fallbackResponse.error) throw new Error(fallbackResponse.error.message);
  return {
    configs: (fallbackResponse.data || []).map(normalizePipelineConfig),
    supportsDisplayOrder: false,
  };
}

export async function listPipelineConfigs(locationId: string) {
  const result = await listPipelineConfigsWithMetadata(locationId);
  return result.configs;
}

export async function savePipelineConfig(input: PipelineConfigInput) {
  const payload = {
    name_snapshot: input.nameSnapshot,
    classification: input.classification,
    account_type_rule: input.accountTypeRule || null,
    include_tags: input.includeTags || [],
    exclude_tags: input.excludeTags || [],
    is_active: input.isActive ?? true,
    ...(input.displayOrder !== undefined ? { display_order: input.displayOrder ?? 0 } : {}),
    notes: input.notes || null,
  };

  const { data: existing, error: existingError } = await supabase
    .from("ghl_pipeline_configs")
    .select("id")
    .eq("location_id", input.locationId)
    .eq("ghl_pipeline_id", input.ghlPipelineId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing?.id) {
    const { data, error } = await supabase
      .from("ghl_pipeline_configs")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as PipelineConfig;
  }

  const { data, error } = await supabase
    .from("ghl_pipeline_configs")
    .insert({
      location_id: input.locationId,
      ghl_pipeline_id: input.ghlPipelineId,
      ...payload,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as PipelineConfig;
}

export function getPipelineConfigMap(configs: PipelineConfig[]) {
  return new Map(configs.map((config) => [config.ghl_pipeline_id, config]));
}

export function parseTagRule(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatTagRule(tags?: string[] | null) {
  return (tags || []).join(", ");
}
