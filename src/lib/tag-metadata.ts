import { type GhlTag } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type TagMetadataRow = {
  ghl_tag_id: string;
  tag_name: string;
  created_at: string;
  updated_at: string;
};

function isMissingMetadataTable(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";

  return (
    message.includes("schema cache") ||
    message.includes("ghl_tag_metadata") && message.includes("does not exist") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

function mergeTagsWithMetadata(tags: GhlTag[], metadataRows: TagMetadataRow[]) {
  const byId = new Map(metadataRows.map((row) => [row.ghl_tag_id, row]));
  const byName = new Map(metadataRows.map((row) => [row.tag_name.toLowerCase(), row]));

  return tags.map((tag) => {
    const metadata = byId.get(tag.id) || byName.get(tag.name.toLowerCase());
    return metadata
      ? {
          ...tag,
          createdAt: tag.createdAt || metadata.created_at,
          updatedAt: tag.updatedAt || metadata.updated_at,
        }
      : tag;
  });
}

export async function loadTagsWithMetadata(locationRecordId: string, tags: GhlTag[]) {
  if (!locationRecordId || tags.length === 0) return tags;

  const { data: existingRows, error: selectError } = await supabase
    .from("ghl_tag_metadata")
    .select("ghl_tag_id, tag_name, created_at, updated_at")
    .eq("location_id", locationRecordId);

  if (selectError) {
    if (isMissingMetadataTable(selectError)) return tags;
    throw new Error(selectError.message);
  }

  const existingIds = new Set((existingRows ?? []).map((row) => row.ghl_tag_id));
  const existingNames = new Set((existingRows ?? []).map((row) => row.tag_name.toLowerCase()));
  const missingRows = tags
    .filter((tag) => !existingIds.has(tag.id) && !existingNames.has(tag.name.toLowerCase()))
    .map((tag) => ({
      location_id: locationRecordId,
      ghl_tag_id: tag.id,
      tag_name: tag.name,
    }));

  let metadataRows = existingRows ?? [];
  if (missingRows.length > 0) {
    const { data: insertedRows, error: insertError } = await supabase
      .from("ghl_tag_metadata")
      .insert(missingRows)
      .select("ghl_tag_id, tag_name, created_at, updated_at");

    if (insertError) {
      if (isMissingMetadataTable(insertError)) return mergeTagsWithMetadata(tags, metadataRows);
      throw new Error(insertError.message);
    }
    metadataRows = [...metadataRows, ...(insertedRows ?? [])];
  }

  return mergeTagsWithMetadata(tags, metadataRows);
}

export async function createTagMetadata(locationRecordId: string, tag: GhlTag) {
  if (!locationRecordId) return tag;

  const { data, error } = await supabase
    .from("ghl_tag_metadata")
    .upsert({
      location_id: locationRecordId,
      ghl_tag_id: tag.id,
      tag_name: tag.name,
    }, { onConflict: "location_id,ghl_tag_id" })
    .select("ghl_tag_id, tag_name, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingMetadataTable(error)) return tag;
    throw new Error(error.message);
  }
  return mergeTagsWithMetadata([tag], data ? [data] : [])[0];
}

export async function updateTagMetadata(locationRecordId: string, tag: GhlTag) {
  if (!locationRecordId) return tag;

  const { data, error } = await supabase
    .from("ghl_tag_metadata")
    .upsert({
      location_id: locationRecordId,
      ghl_tag_id: tag.id,
      tag_name: tag.name,
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id,ghl_tag_id" })
    .select("ghl_tag_id, tag_name, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingMetadataTable(error)) return tag;
    throw new Error(error.message);
  }
  return mergeTagsWithMetadata([tag], data ? [data] : [])[0];
}

export async function deleteTagMetadata(locationRecordId: string, tagId: string) {
  if (!locationRecordId || !tagId) return;

  const { error } = await supabase
    .from("ghl_tag_metadata")
    .delete()
    .eq("location_id", locationRecordId)
    .eq("ghl_tag_id", tagId);

  if (error && !isMissingMetadataTable(error)) throw new Error(error.message);
}
