import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, FileText, FolderOpen, Loader2, Presentation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getGoogleDriveStatus,
  listGoogleDriveFolder,
  listVisibleMatterDriveFolders,
  type DriveBrowseItem,
  type GoogleDriveIntegrationStatus,
  type VisibleMatterDriveFolder,
} from "@/lib/google-drive";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type BrowseSegment = {
  id: string;
  name: string;
};

type GoogleDriveBrowserProps = {
  viewMode: "list" | "grid";
  displayMode: "files" | "folders";
  initialFolder?: { id: string; name: string } | null;
  onInitialFolderConsumed?: () => void;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatFileSize(size?: number | null) {
  if (!size || size <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function DriveItemIcon({ item }: { item: DriveBrowseItem }) {
  if (item.isFolder) return <FolderOpen className="h-4 w-4 text-primary" />;
  if (item.mimeType.includes("spreadsheet")) return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
  if (item.mimeType.includes("presentation")) return <Presentation className="h-4 w-4 text-amber-600" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

export function GoogleDriveBrowser({
  viewMode,
  displayMode,
  initialFolder = null,
  onInitialFolderConsumed,
}: GoogleDriveBrowserProps) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [status, setStatus] = useState<GoogleDriveIntegrationStatus | null>(null);
  const [matterFolders, setMatterFolders] = useState<VisibleMatterDriveFolder[]>([]);
  const [path, setPath] = useState<BrowseSegment[]>([]);
  const [items, setItems] = useState<DriveBrowseItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [previewItem, setPreviewItem] = useState<DriveBrowseItem | null>(null);

  const currentFolderId = path.length > 0 ? path[path.length - 1]?.id : null;
  const isAtRoot = path.length === 0;

  const loadInitial = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [driveStatus, folders] = await Promise.all([
        getGoogleDriveStatus(),
        listVisibleMatterDriveFolders().catch(() => []),
      ]);
      setStatus(driveStatus);
      setMatterFolders(folders);
    } catch (error) {
      toastRef.current({
        title: "Google Drive unavailable",
        description: getUserFriendlyErrorMessage(error, "Could not load Google Drive."),
        variant: "destructive",
      });
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const loadFolder = useCallback(async (folderId: string, append = false, pageToken?: string) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const result = await listGoogleDriveFolder(folderId, pageToken);
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setNextPageToken(result.nextPageToken || null);
    } catch (error) {
      toastRef.current({
        title: "Could not load folder",
        description: getUserFriendlyErrorMessage(error, "Could not load Google Drive folder contents."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!initialFolder?.id || !status?.connected) return;
    setPath([{ id: initialFolder.id, name: initialFolder.name }]);
    onInitialFolderConsumed?.();
  }, [initialFolder, onInitialFolderConsumed, status?.connected]);

  useEffect(() => {
    if (!currentFolderId) return;
    void loadFolder(currentFolderId);
  }, [currentFolderId, loadFolder]);

  const folderItems = useMemo(() => items.filter((item) => item.isFolder), [items]);
  const fileItems = useMemo(() => items.filter((item) => !item.isFolder), [items]);

  const enterFolder = (segments: BrowseSegment[]) => {
    setItems([]);
    setNextPageToken(null);
    if (segments.length > 0) setLoading(true);
    setPath(segments);
  };

  const openFolder = (segment: BrowseSegment) => {
    enterFolder([...path, segment]);
  };

  const openMatterFolder = (folder: VisibleMatterDriveFolder) => {
    enterFolder([{ id: folder.driveFolderId, name: folder.folderName }]);
  };

  const openRootFolder = () => {
    const rootId = status?.integration?.rootFolderId;
    if (!rootId) {
      toastRef.current({
        title: "Lawbric folder unavailable",
        description: "The Google Drive root folder is not configured yet.",
        variant: "destructive",
      });
      return;
    }
    enterFolder([{ id: rootId, name: "Lawbric" }]);
  };

  const navigateToIndex = (index: number) => {
    if (index < 0) {
      setPath([]);
      setItems([]);
      setNextPageToken(null);
      return;
    }
    setPath((current) => current.slice(0, index + 1));
  };

  const handleItemOpen = (item: DriveBrowseItem) => {
    if (item.isFolder) {
      openFolder({ id: item.id, name: item.name });
      return;
    }
    setPreviewItem(item);
  };

  if (initialLoading && !status) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Google Drive...
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-16 text-center">
        <FolderOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-medium text-foreground">Google Drive is not connected</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect Google Drive from Tools → Connected Apps to browse folders here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isAtRoot ? (
        <nav aria-label="Google Drive breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <button type="button" className="font-medium text-[#2384CA] hover:underline" onClick={() => navigateToIndex(-1)}>
            Google Drive
          </button>
          {path.map((segment, index) => (
            <span key={`${segment.id}-${index}`} className="flex min-w-0 items-center gap-2">
              <span>/</span>
              <button
                type="button"
                className={cn(
                  "max-w-[240px] truncate font-medium hover:underline",
                  index === path.length - 1 ? "text-foreground" : "text-[#2384CA]",
                )}
                onClick={() => navigateToIndex(index)}
              >
                {segment.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      {isAtRoot ? (
        <>
          {status.integration?.rootFolderId ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Card className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md" onClick={openRootFolder}>
                  <CardHeader className="p-3 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-xs font-semibold">Lawbric</CardTitle>
                        <div className="mt-1 text-xs text-muted-foreground">Root folder</div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
                {matterFolders.map((folder) => (
                  <Card
                    key={folder.id}
                    className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md"
                    onClick={() => openMatterFolder(folder)}
                  >
                    <CardHeader className="p-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                            <FolderOpen className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-xs font-semibold">{folder.folderName}</CardTitle>
                            <Link
                              to={`/case/${folder.caseId}`}
                              state={{ activeDetailTab: "documents" }}
                              className="mt-1 block truncate text-xs text-[#2384CA] hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {folder.matterName}
                            </Link>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Matter</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.integration?.rootFolderId ? (
                      <tr className="cursor-pointer border-b hover:bg-muted/30" onClick={openRootFolder}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 font-medium text-[#2384CA]">
                            <FolderOpen className="h-4 w-4" />
                            Lawbric
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">All matters</td>
                        <td className="px-4 py-3 text-muted-foreground">Root folder</td>
                      </tr>
                    ) : null}
                    {matterFolders.map((folder) => (
                      <tr key={folder.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => openMatterFolder(folder)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 font-medium text-[#2384CA]">
                            <FolderOpen className="h-4 w-4" />
                            {folder.folderName}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/case/${folder.caseId}`}
                            state={{ activeDetailTab: "documents" }}
                            className="block truncate font-medium text-[#2384CA] hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {folder.matterName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">Matter folder</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </>
      ) : loading && items.length === 0 ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading folder contents...
        </div>
      ) : (
        <>
          {(displayMode === "folders" ? folderItems : items).length === 0 && fileItems.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              This folder is empty.
            </div>
          ) : null}

          {folderItems.length > 0 && (displayMode === "folders" || displayMode === "files") ? (
            <>
              {displayMode === "folders" && fileItems.length > 0 ? (
                <div className="text-sm font-medium text-foreground">Folders</div>
              ) : null}
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {folderItems.map((item) => (
                    <Card key={item.id} className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md" onClick={() => handleItemOpen(item)}>
                      <CardHeader className="p-3 pb-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                            <FolderOpen className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-xs font-semibold">{item.name}</CardTitle>
                            <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.modifiedTime)}</div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Modified</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {folderItems.map((item) => (
                        <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/30" onClick={() => handleItemOpen(item)}>
                          <td className="px-4 py-3 font-medium text-[#2384CA]">
                            <div className="flex items-center gap-3">
                              <FolderOpen className="h-4 w-4" />
                              {item.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.modifiedTime)}</td>
                          <td className="px-4 py-3 text-muted-foreground">Folder</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {fileItems.length > 0 && displayMode === "files" ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {fileItems.map((item) => (
                  <Card key={item.id} className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md" onClick={() => handleItemOpen(item)}>
                    <CardHeader className="p-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40">
                            <DriveItemIcon item={item} />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-xs font-semibold">{item.name}</CardTitle>
                            <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.modifiedTime)}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 px-2 py-0 text-[10px]">{formatFileSize(item.size)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 text-xs text-muted-foreground">Google Drive file</CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Modified</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileItems.map((item) => (
                      <tr key={item.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => handleItemOpen(item)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 font-medium text-foreground">
                            <DriveItemIcon item={item} />
                            {item.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.modifiedTime)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatFileSize(item.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {displayMode === "folders" && fileItems.length > 0 ? (
            <>
              <div className="pt-2 text-sm font-medium text-foreground">Files</div>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Modified</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileItems.map((item) => (
                      <tr key={item.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => handleItemOpen(item)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 font-medium text-foreground">
                            <DriveItemIcon item={item} />
                            {item.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.modifiedTime)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatFileSize(item.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {nextPageToken && currentFolderId ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={loadingMore}
                onClick={() => void loadFolder(currentFolderId, true, nextPageToken)}
              >
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{previewItem?.name || "Preview"}</DialogTitle>
          </DialogHeader>
          {previewItem ? (
            <iframe
              title={previewItem.name}
              src={`https://drive.google.com/file/d/${previewItem.id}/preview`}
              className="h-[70vh] w-full border-0 bg-background"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
