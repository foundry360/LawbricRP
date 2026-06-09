import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/SearchableSelect";
import { CONTACT_RELATIONSHIP_TYPES, type ContactRelationshipInput } from "@/lib/contact-relationships";

export type RelatedContactOption = {
  id: string;
  name: string;
  email?: string;
};

type ContactRelationshipsFieldProps = {
  value?: ContactRelationshipInput[];
  onChange: (relationships: ContactRelationshipInput[]) => void;
  contactOptions: RelatedContactOption[];
  currentContactId?: string;
};

function getContactOptionLabel(contact?: RelatedContactOption) {
  if (!contact) return "";
  return `${contact.name}${contact.email ? ` (${contact.email})` : ""}`;
}

export function ContactRelationshipsField({
  value = [],
  onChange,
  contactOptions,
  currentContactId,
}: ContactRelationshipsFieldProps) {
  const availableContacts = contactOptions.filter((contact) => String(contact.id) !== String(currentContactId || ""));

  const updateRelationship = (index: number, updates: Partial<ContactRelationshipInput>) => {
    onChange(value.map((relationship, itemIndex) => (
      itemIndex === index ? { ...relationship, ...updates } : relationship
    )));
  };

  const removeRelationship = (index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">Related Contacts</Label>
          <p className="text-xs text-muted-foreground">Link this contact to another contact.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => onChange([
            ...value,
            { relatedContactId: "", relationshipType: CONTACT_RELATIONSHIP_TYPES[0], notes: "" },
          ])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          No related contacts added.
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((relationship, index) => (
            <div key={`${relationship.relatedContactId || "new"}-${index}`} className="space-y-2 rounded-md bg-muted/20 p-3">
              <SearchableSelect
                value={relationship.relatedContactId}
                onValueChange={(relatedContactId) => updateRelationship(index, { relatedContactId })}
                options={availableContacts.map((contact) => contact.id)}
                placeholder="Select related contact"
                searchPlaceholder="Search contacts..."
                emptyMessage="No contacts found."
                getOptionLabel={(contactId) =>
                  getContactOptionLabel(availableContacts.find((contact) => contact.id === contactId)) || contactId
                }
              />
              <div className="flex items-center gap-2">
                <SearchableSelect
                  value={relationship.relationshipType}
                  onValueChange={(relationshipType) => updateRelationship(index, { relationshipType })}
                  options={CONTACT_RELATIONSHIP_TYPES}
                  placeholder="Relationship"
                  searchPlaceholder="Search relationships..."
                  emptyMessage="No relationship types found."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                  onClick={() => removeRelationship(index)}
                  aria-label="Remove related contact"
                  tooltip="Remove related contact"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
