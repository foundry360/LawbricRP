import { supabase } from "@/lib/supabase";

export const CONTACT_RELATIONSHIP_TYPES = [
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Business Partner",
  "Attorney",
  "Referral Source",
  "Other",
];

export type ContactRelationshipInput = {
  relatedContactId: string;
  relationshipType: string;
  notes?: string | null;
};

export type ContactRelationship = {
  id: string;
  location_id: string;
  source_ghl_contact_id: string;
  related_ghl_contact_id: string;
  relationship_type: string;
  notes?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeRelationshipInput(input: ContactRelationshipInput) {
  return {
    relatedContactId: input.relatedContactId.trim(),
    relationshipType: input.relationshipType.trim() || "Other",
    notes: input.notes?.trim() || null,
  };
}

export function getRelatedContactId(relationship: ContactRelationship, contactId: string) {
  return relationship.source_ghl_contact_id === contactId
    ? relationship.related_ghl_contact_id
    : relationship.source_ghl_contact_id;
}

export async function listContactRelationships(locationId: string, contactId: string) {
  if (!locationId || !contactId) return [];

  const { data, error } = await supabase
    .from("contact_relationships")
    .select("*")
    .eq("location_id", locationId)
    .is("deleted_at", null)
    .or(`source_ghl_contact_id.eq.${contactId},related_ghl_contact_id.eq.${contactId}`)
    .order("relationship_type", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as ContactRelationship[];
}

export async function saveContactRelationships(
  locationId: string,
  contactId: string,
  relationships: ContactRelationshipInput[],
) {
  if (!locationId || !contactId) return [];

  const existingRelationships = await listContactRelationships(locationId, contactId);
  if (existingRelationships.length > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("contact_relationships")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id || null,
        delete_reason: null,
      })
      .in("id", existingRelationships.map((relationship) => relationship.id));

    if (error) throw new Error(error.message);
  }

  const uniqueRelationships = Array.from(
    relationships
      .map(normalizeRelationshipInput)
      .filter((relationship) => relationship.relatedContactId && relationship.relatedContactId !== contactId)
      .reduce((map, relationship) => {
        if (!map.has(relationship.relatedContactId)) map.set(relationship.relatedContactId, relationship);
        return map;
      }, new Map<string, ReturnType<typeof normalizeRelationshipInput>>())
      .values(),
  );

  if (uniqueRelationships.length === 0) return [];

  const { data, error } = await supabase
    .from("contact_relationships")
    .upsert(
      uniqueRelationships.map((relationship) => ({
        location_id: locationId,
        source_ghl_contact_id: contactId,
        related_ghl_contact_id: relationship.relatedContactId,
        relationship_type: relationship.relationshipType,
        notes: relationship.notes,
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
      })),
      { onConflict: "location_id,source_ghl_contact_id,related_ghl_contact_id" },
    )
    .select("*");

  if (error) throw new Error(error.message);
  return (data || []) as ContactRelationship[];
}
