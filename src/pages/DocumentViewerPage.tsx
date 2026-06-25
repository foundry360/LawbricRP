import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserLink } from "@/components/UserLink";
import { useToast } from "@/hooks/use-toast";
import {
  getDocumentFolderName,
  getDocumentName,
  getStorageTypeLabel,
  viewDocument,
  type DocumentRecord,
  type ViewDocumentResult,
} from "@/lib/documents";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const UNFILED_FOLDER_NAME = "Unfiled";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes <= 0) return "Not set";
  const units = ["B", "KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getDocumentExtension(document: DocumentRecord) {
  const name = getDocumentName(document).toLowerCase();
  return name.includes(".") ? name.split(".").pop() || "" : "";
}

function getDocumentTypeIconInfo(document?: DocumentRecord | null) {
  const mimeType = String(document?.mime_type || "").toLowerCase();
  const extension = document ? getDocumentExtension(document) : "";
  if (document?.storage_type && document.storage_type !== "internal") {
    return { Icon: ExternalLink, className: "text-sky-600" };
  }
  if (mimeType.includes("pdf") || extension === "pdf") {
    return { Icon: FileText, className: "text-red-600" };
  }
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "heic"].includes(extension)) {
    return { Icon: FileImage, className: "text-purple-600" };
  }
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("csv") ||
    ["xls", "xlsx", "csv"].includes(extension)
  ) {
    return { Icon: FileSpreadsheet, className: "text-green-600" };
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed") || ["zip", "rar", "7z", "gz"].includes(extension)) {
    return { Icon: FileArchive, className: "text-amber-600" };
  }
  return { Icon: FileText, className: "text-primary" };
}

function getDocumentViewerType(document?: DocumentRecord | null, result?: ViewDocumentResult | null) {
  const mimeType = String(result?.previewMimeType || document?.mime_type || "").toLowerCase();
  const extension = document ? getDocumentExtension(document) : "";
  const displayUrl = String(result?.previewUrl || result?.url || "").toLowerCase();
  if (document?.storage_type === "gdrive" && !result?.previewUrl) return "external";
  if (document?.storage_type === "onedrive") return "external";
  if (document?.storage_type && document.storage_type !== "internal" && !result?.previewUrl) return "external";
  if (mimeType.includes("pdf") || extension === "pdf" || displayUrl.includes(".pdf")) return "pdf";
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) return "image";
  if (mimeType.startsWith("text/") || ["txt", "csv", "md", "json"].includes(extension)) return "iframe";
  if (!document && result?.url && (!result.storageType || result.storageType === "internal")) return "iframe";
  return "download";
}

function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="min-w-0 text-foreground">{value || "Not set"}</div>
    </div>
  );
}

function DetailsSection({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-3 pt-2">{children}</div>;
}

function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(0.9);
  const [pageWidth, setPageWidth] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"scroll" | "page">("scroll");

  useEffect(() => {
    setNumPages(0);
    setPageNumber(1);
    setScale(0.9);
    setPageWidth(null);
    setViewMode("scroll");
    pageRefs.current = [];
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const availableWidth = Math.max(320, container.clientWidth - 96);
      setPageWidth(availableWidth);
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const updateCurrentPageFromScroll = () => {
    if (viewMode !== "scroll") return;
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const anchorY = containerRect.top + Math.min(160, containerRect.height * 0.25);
    let nextPage = pageNumber;
    let closestDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((pageElement, index) => {
      if (!pageElement) return;
      const pageRect = pageElement.getBoundingClientRect();
      const pageMidpoint = pageRect.top + pageRect.height / 2;
      const distance = Math.abs(pageMidpoint - anchorY);
      if (distance < closestDistance) {
        closestDistance = distance;
        nextPage = index + 1;
      }
    });

    if (nextPage !== pageNumber) setPageNumber(nextPage);
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {numPages > 0 ? `Page ${pageNumber} of ${numPages}` : "Loading PDF..."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={viewMode === "scroll" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setViewMode("scroll")}
          >
            Scroll
          </Button>
          <Button
            type="button"
            variant={viewMode === "page" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setViewMode("page")}
          >
            Page
          </Button>
          <div className="mx-1 h-6 w-px bg-border" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={viewMode !== "page" || pageNumber <= 1}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={viewMode !== "page" || !numPages || pageNumber >= numPages}
            onClick={() => setPageNumber((current) => Math.min(numPages || current, current + 1))}
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-6 w-px bg-border" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={scale <= 0.7}
            onClick={() => setScale((current) => Math.max(0.7, Number((current - 0.1).toFixed(1))))}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-12 text-center text-xs font-medium text-muted-foreground">{Math.round(scale * 100)}%</div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={scale >= 1}
            onClick={() => setScale((current) => Math.min(1, Number((current + 0.1).toFixed(1))))}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="hover-scrollbar min-h-0 flex-1 overflow-auto" onScroll={updateCurrentPageFromScroll}>
        <div className="flex min-h-full justify-center px-6 py-8">
          <PdfDocument
            file={url}
            loading={(
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading PDF...
              </div>
            )}
            error={(
              <div className="max-w-md rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
                This PDF could not be rendered in the custom viewer. Use Open to view it in a new tab.
              </div>
            )}
            onLoadSuccess={({ numPages: nextNumPages }: { numPages: number }) => {
              setNumPages(nextNumPages);
              setPageNumber(1);
            }}
          >
            {viewMode === "scroll" ? (
              <div className="space-y-6">
                {Array.from({ length: numPages || 0 }, (_, index) => (
                  <div
                    key={index + 1}
                    ref={(element) => {
                      pageRefs.current[index] = element;
                    }}
                    className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-border"
                  >
                    <PdfPage pageNumber={index + 1} width={pageWidth ? pageWidth * scale : undefined} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-border">
                <PdfPage pageNumber={pageNumber} width={pageWidth ? pageWidth * scale : undefined} />
              </div>
            )}
          </PdfDocument>
        </div>
      </div>
    </div>
  );
}

export function DocumentViewerPage() {
  const { documentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [result, setResult] = useState<ViewDocumentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!documentId) {
      setErrorMessage("Document ID is required.");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setErrorMessage("");
    viewDocument(documentId)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = getUserFriendlyErrorMessage(error, "Could not open this document. Please try again.");
        setErrorMessage(message);
        toast({ title: "Document Not Opened", description: message, variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const documentRecord = result?.document || null;
  const viewerType = useMemo(() => getDocumentViewerType(documentRecord, result), [documentRecord, result]);
  const displayUrl = result?.previewUrl || result?.url || null;
  const { Icon, className: iconClassName } = getDocumentTypeIconInfo(documentRecord);
  const matterId = documentRecord?.case_id || documentRecord?.matter_id || documentRecord?.case?.id;
  const matterName = documentRecord?.case?.case_name || documentRecord?.case?.case_number || (matterId ? `Matter ${matterId.slice(0, 8)}` : "Not set");
  const uploadedBy = documentRecord?.uploaded_user?.full_name || documentRecord?.uploaded_user?.email || "Unknown user";
  const updatedBy =
    documentRecord?.updated_user?.full_name ||
    documentRecord?.updated_user?.email ||
    uploadedBy;
  const uploadedByUserId = documentRecord?.uploaded_user?.id || documentRecord?.uploaded_by || "";
  const updatedByUserId = documentRecord?.updated_user?.id || documentRecord?.updated_by || uploadedByUserId;
  const originState = location.state as { documentViewerOrigin?: string; caseId?: string } | null;
  const handleBack = () => {
    if (originState?.documentViewerOrigin === "matterDocuments" && originState.caseId) {
      navigate(`/case/${originState.caseId}`, { state: { activeDetailTab: "documents" } });
      return;
    }

    navigate("/documents");
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full flex-col overflow-hidden px-4 pb-2 pt-2 sm:px-6">
      <div className="shrink-0 border-b border-border pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-muted hover:text-foreground" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
              <Icon className={cn("h-5 w-5", iconClassName)} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{documentRecord ? getDocumentName(documentRecord) : "Document Viewer"}</h1>
            </div>
          </div>
          {result?.url ? (
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[400px_1fr] lg:divide-x lg:divide-border">
        <aside className="hover-scrollbar min-h-0 overflow-y-auto py-6 lg:pr-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Document Details</h2>
            </div>
            <Accordion type="multiple" defaultValue={["document", "location", "users", "dates", "details"]} className="w-full">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading document...
                </div>
              ) : errorMessage ? (
                <div className="text-sm text-destructive">{errorMessage}</div>
              ) : documentRecord ? (
                <>
                  <AccordionItem value="document">
                    <AccordionTrigger>Document</AccordionTrigger>
                    <AccordionContent>
                      <DetailsSection title="Document">
                        <MetadataRow label="Name" value={<span className="break-words">{getDocumentName(documentRecord)}</span>} />
                        <MetadataRow label="Type" value={<Badge variant="outline">{getStorageTypeLabel(documentRecord.storage_type)}</Badge>} />
                        <MetadataRow label="MIME Type" value={documentRecord.mime_type || "Not set"} />
                        <MetadataRow label="Size" value={formatFileSize(documentRecord.size_bytes)} />
                      </DetailsSection>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="location">
                    <AccordionTrigger>Location</AccordionTrigger>
                    <AccordionContent>
                      <DetailsSection title="Location">
                        <MetadataRow label="Matter" value={matterId ? <Link to={`/case/${matterId}`} className="text-[#2384CA] hover:underline">{matterName}</Link> : matterName} />
                        <MetadataRow label="Folder" value={getDocumentFolderName(documentRecord) || UNFILED_FOLDER_NAME} />
                      </DetailsSection>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="users">
                    <AccordionTrigger>Users</AccordionTrigger>
                    <AccordionContent>
                      <DetailsSection title="Users">
                        <MetadataRow
                          label="Uploaded By"
                          value={
                            <UserLink
                              userId={uploadedByUserId}
                              user={documentRecord.uploaded_user}
                              name={uploadedBy}
                              fallback="Unknown user"
                            />
                          }
                        />
                        <MetadataRow
                          label="Last User Edit"
                          value={
                            <UserLink
                              userId={updatedByUserId}
                              user={documentRecord.updated_user || documentRecord.uploaded_user}
                              name={updatedBy}
                              fallback="Unknown user"
                            />
                          }
                        />
                      </DetailsSection>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="dates">
                    <AccordionTrigger>Dates</AccordionTrigger>
                    <AccordionContent>
                      <DetailsSection title="Dates">
                        <MetadataRow label="Created" value={formatDateTime(documentRecord.created_at)} />
                        <MetadataRow label="Updated" value={formatDateTime(documentRecord.updated_at)} />
                      </DetailsSection>
                    </AccordionContent>
                  </AccordionItem>
                </>
              ) : result?.url ? (
                <>
                  <AccordionItem value="document">
                    <AccordionTrigger>Document</AccordionTrigger>
                    <AccordionContent>
                      <DetailsSection title="Document">
                        <MetadataRow label="Status" value="Preview loaded" />
                        <MetadataRow label="Type" value={<Badge variant="outline">{getStorageTypeLabel(result.storageType)}</Badge>} />
                      </DetailsSection>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="details">
                    <AccordionTrigger>Details</AccordionTrigger>
                    <AccordionContent>
                      <DetailsSection title="Details">
                        <MetadataRow label="Metadata" value="Document details are still loading or unavailable." />
                      </DetailsSection>
                    </AccordionContent>
                  </AccordionItem>
                </>
              ) : null}
            </Accordion>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden py-6 lg:pl-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-muted/20">
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading preview...
                </div>
              </div>
            ) : errorMessage ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {errorMessage}
              </div>
            ) : displayUrl && viewerType === "pdf" ? (
              <PdfViewer url={displayUrl} />
            ) : displayUrl && viewerType === "image" ? (
              <div className="flex flex-1 items-center justify-center p-4 pt-6">
                <img src={displayUrl} alt={documentRecord ? getDocumentName(documentRecord) : "Document preview"} className="max-h-full max-w-full object-contain" />
              </div>
            ) : displayUrl && viewerType === "iframe" ? (
              <iframe src={displayUrl} title={documentRecord ? getDocumentName(documentRecord) : "Document preview"} className="min-h-0 flex-1 w-full border-0 pt-6" />
            ) : result?.url ? (
              <div className="flex flex-1 items-center justify-center px-6">
                <div className="max-w-md text-center">
                  <Download className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Preview not available</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This document type may not be previewable in the browser. Open it in a new tab to view or download it.
                  </p>
                  <Button
                    type="button"
                    className="mt-5 rounded-full"
                    onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Document
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
