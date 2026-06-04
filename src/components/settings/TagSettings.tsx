import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  createLocationTag,
  deleteLocationTag,
  getAppLocationContext,
  getLocationTags,
  type GhlTag,
  updateLocationTag,
} from "@/lib/api";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import {
  createTagMetadata,
  deleteTagMetadata,
  loadTagsWithMetadata,
  updateTagMetadata,
} from "@/lib/tag-metadata";

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
}

export function TagSettings() {
  const { toast } = useToast();
  const [locationId, setLocationId] = useState("");
  const [locationRecordId, setLocationRecordId] = useState("");
  const [tags, setTags] = useState<GhlTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tagName, setTagName] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<GhlTag | null>(null);
  const [tagToDelete, setTagToDelete] = useState<GhlTag | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedTags = useMemo(
    () =>
      tags
        .filter((tag) => tag.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tags, searchTerm],
  );

  const loadTags = async () => {
    setLoading(true);
    try {
      const context = await getAppLocationContext();
      const ghlLocationId = context.location?.ghlLocationId || "";
      const appLocationId = context.location?.id || "";
      setLocationId(ghlLocationId);
      setLocationRecordId(appLocationId);

      if (!ghlLocationId) {
        setTags([]);
        return;
      }

      const fetchedTags = await getLocationTags(ghlLocationId);
      setTags(appLocationId ? await loadTagsWithMetadata(appLocationId, fetchedTags) : fetchedTags);
    } catch (error) {
      toast({
        title: "Tags Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load tags. Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  const openCreate = () => {
    setEditingTag(null);
    setTagName("");
    setIsEditorOpen(true);
  };

  const openEdit = (tag: GhlTag) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setEditingTag(null);
    setTagName("");
    setIsEditorOpen(false);
  };

  const handleSave = async () => {
    const trimmedName = tagName.trim();
    if (!trimmedName) {
      toast({ title: "Tag Name Required", description: "Enter a tag name before saving.", variant: "destructive" });
      return;
    }
    if (!locationId) {
      toast({ title: "Location Missing", description: "No GHL location is configured.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const apiTag = editingTag
        ? await updateLocationTag(locationId, editingTag.id, trimmedName)
        : await createLocationTag(locationId, trimmedName);
      const savedTag = {
        ...apiTag,
        id: apiTag.id || editingTag?.id || trimmedName,
        name: apiTag.name || trimmedName,
      };
      const savedTagWithMetadata =
        locationRecordId && editingTag
          ? await updateTagMetadata(locationRecordId, savedTag)
          : locationRecordId
            ? await createTagMetadata(locationRecordId, savedTag)
            : savedTag;

      setTags((current) => {
        const exists = current.some((tag) => tag.id === savedTagWithMetadata.id);
        return exists
          ? current.map((tag) => (tag.id === savedTagWithMetadata.id ? { ...tag, ...savedTagWithMetadata } : tag))
          : [...current, savedTagWithMetadata];
      });
      toast({ title: editingTag ? "Tag Updated" : "Tag Created", description: `${trimmedName} has been saved.` });
      closeEditor();
    } catch (error) {
      toast({
        title: editingTag ? "Tag Not Updated" : "Tag Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not save this tag. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tagToDelete || !locationId) return;
    setIsDeleting(true);
    try {
      await deleteLocationTag(locationId, tagToDelete.id);
      await deleteTagMetadata(locationRecordId, tagToDelete.id).catch((error) => {
        console.error("Failed to delete tag metadata", error);
      });
      setTags((current) => current.filter((tag) => tag.id !== tagToDelete.id));
      toast({ title: "Tag Deleted", description: `${tagToDelete.name} was permanently deleted.` });
      setTagToDelete(null);
    } catch (error) {
      toast({
        title: "Tag Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete this tag. Please try again."),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-medium">Tags</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage tags.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search tags..."
            className="h-9 w-48"
          />
          <Button
            size="icon"
            className="h-9 min-h-9 w-9 min-w-9 max-w-9 rounded-full p-0"
            onClick={openCreate}
            aria-label="New Tag"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="h-12 px-4 py-4 font-medium">Tag Name</th>
              <th className="h-12 px-4 py-4 font-medium">Created On</th>
              <th className="h-12 px-4 py-4 font-medium">Updated On</th>
              <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="h-32 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">Loading tags...</p>
                </td>
              </tr>
            ) : sortedTags.length === 0 ? (
              <tr>
                <td colSpan={4} className="h-32 text-center text-muted-foreground">
                  No tags found.
                </td>
              </tr>
            ) : (
              sortedTags.map((tag) => (
                <tr key={tag.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{tag.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(tag.createdAt)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(tag.updatedAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(tag)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setTagToDelete(tag)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={isEditorOpen} onOpenChange={(open) => !open && closeEditor()}>
        <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingTag ? "Edit Tag" : "Create Tag"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Tag Name</Label>
              <Input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="e.g. VIP Client" />
            </div>
            <SheetFooter className="pt-2">
              <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Tag"}
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      <DeleteConfirmationDialog
        open={Boolean(tagToDelete)}
        onOpenChange={(open) => !open && setTagToDelete(null)}
        title="Permanently delete tag?"
        recordType="tag"
        recordName={tagToDelete?.name}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
