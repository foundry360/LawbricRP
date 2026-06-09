import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, GitBranch, Loader2, Pencil, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAppLocationContext, getPipelines, type GhlPipeline } from "@/lib/api";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import {
  formatTagRule,
  isMissingPipelineDisplayOrderError,
  listPipelineConfigsWithMetadata,
  parseTagRule,
  savePipelineConfig,
  type PipelineClassification,
  type PipelineConfig,
} from "@/lib/pipeline-configs";
import { cn } from "@/lib/utils";

const PIPELINE_CLASSIFICATIONS: Array<{ value: PipelineClassification; label: string }> = [
  { value: "unclassified", label: "Unclassified" },
  { value: "prospecting", label: "Leads" },
  { value: "matter", label: "Matters" },
];

const ACCOUNT_TYPE_OPTIONS = [
  "Any",
  "Lead",
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
const LEAD_ACCOUNT_TYPE = "Lead";

type PipelineRow = {
  pipeline: GhlPipeline;
  config: PipelineConfig | null;
};

type PipelineSortColumn = "order" | "name" | "classification" | "stages" | "status" | "updated";
type PipelineStatusFilter = "all" | "active" | "inactive";
type PipelineDisplaySection = "leads" | "matters";

function getConfigForPipeline(configs: PipelineConfig[], pipelineId: string) {
  return configs.find((config) => config.ghl_pipeline_id === pipelineId) || null;
}

function getClassificationLabel(classification?: string | null) {
  return PIPELINE_CLASSIFICATIONS.find((option) => option.value === classification)?.label || "Unclassified";
}

function pipelineConfigMatchesLeadAccountType(config?: PipelineConfig | null) {
  const accountTypeRule = String(config?.account_type_rule || "").trim().toLowerCase();
  return accountTypeRule === LEAD_ACCOUNT_TYPE.toLowerCase();
}

function getClassificationClass(classification?: string | null) {
  if (classification === "prospecting") return "bg-amber-100 text-amber-800";
  if (classification === "matter") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

function getPipelineDisplaySection(config?: PipelineConfig | null): PipelineDisplaySection {
  return config?.classification === "prospecting" || pipelineConfigMatchesLeadAccountType(config) ? "leads" : "matters";
}

function getPipelineDisplaySectionLabel(config?: PipelineConfig | null) {
  return getPipelineDisplaySection(config) === "leads" ? "Leads" : "Matters";
}

function getPipelineDisplayOrder(config?: PipelineConfig | null) {
  const order = config?.display_order ?? 0;
  return order > 0 ? order : Number.MAX_SAFE_INTEGER;
}

function comparePipelineRowsByDisplayOrder(a: PipelineRow, b: PipelineRow) {
  const sectionComparison = getPipelineDisplaySection(a.config).localeCompare(getPipelineDisplaySection(b.config));
  if (sectionComparison !== 0) return sectionComparison;
  const orderComparison = getPipelineDisplayOrder(a.config) - getPipelineDisplayOrder(b.config);
  if (orderComparison !== 0) return orderComparison;
  return a.pipeline.name.localeCompare(b.pipeline.name);
}

export function PipelinesPage() {
  const { toast } = useToast();
  const [locationId, setLocationId] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [configs, setConfigs] = useState<PipelineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<PipelineClassification | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PipelineStatusFilter>("all");
  const [sortColumn, setSortColumn] = useState<PipelineSortColumn>("order");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editingPipeline, setEditingPipeline] = useState<GhlPipeline | null>(null);
  const [savingOrderPipelineId, setSavingOrderPipelineId] = useState<string | null>(null);
  const [isPipelineOrderingAvailable, setIsPipelineOrderingAvailable] = useState(true);

  const loadPipelineData = async () => {
    setLoading(true);
    try {
      const context = await getAppLocationContext();
      const appLocationId = context.location?.id || "";
      const nextGhlLocationId = context.location?.ghlLocationId || "";
      setLocationId(appLocationId);
      setGhlLocationId(nextGhlLocationId);

      const [pipelineRows, configRows] = await Promise.all([
        nextGhlLocationId
          ? getPipelines(nextGhlLocationId).catch((error) => {
              toast({
                title: "Pipelines Not Loaded",
                description: getUserFriendlyErrorMessage(error, "Could not load pipelines."),
                variant: "destructive",
              });
              return [] as GhlPipeline[];
            })
          : Promise.resolve([] as GhlPipeline[]),
        appLocationId
          ? listPipelineConfigsWithMetadata(appLocationId)
              .then((result) => {
                setIsPipelineOrderingAvailable(result.supportsDisplayOrder);
                return result.configs;
              })
              .catch((error) => {
                setIsPipelineOrderingAvailable(false);
                toast({
                  title: "Pipeline Settings Not Loaded",
                  description: getUserFriendlyErrorMessage(error, "Could not load pipeline settings."),
                  variant: "destructive",
                });
                return [] as PipelineConfig[];
              })
          : Promise.resolve([] as PipelineConfig[]),
      ]);

      setPipelines(pipelineRows);
      setConfigs(configRows);
    } catch (error) {
      toast({
        title: "Pipelines Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load pipeline configuration."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPipelineData();
  }, []);

  const allRows = useMemo<PipelineRow[]>(
    () => pipelines.map((pipeline) => ({ pipeline, config: getConfigForPipeline(configs, pipeline.id) })),
    [configs, pipelines],
  );

  const orderedRowsBySection = useMemo(
    () => ({
      leads: allRows
        .filter((row) => getPipelineDisplaySection(row.config) === "leads")
        .sort(comparePipelineRowsByDisplayOrder),
      matters: allRows
        .filter((row) => getPipelineDisplaySection(row.config) === "matters")
        .sort(comparePipelineRowsByDisplayOrder),
    }),
    [allRows],
  );

  const rows = useMemo<PipelineRow[]>(() => {
    const search = searchTerm.trim().toLowerCase();
    return allRows
      .filter(({ pipeline, config }) => {
        const classification = config?.classification || "unclassified";
        const isActive = config?.is_active !== false;
        if (classificationFilter !== "all" && classification !== classificationFilter) return false;
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "inactive" && isActive) return false;
        if (!search) return true;
        const haystack = [
          pipeline.name,
          pipeline.id,
          getClassificationLabel(classification),
          getPipelineDisplaySectionLabel(config),
          config?.account_type_rule,
          ...(config?.include_tags || []),
          ...(config?.exclude_tags || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortColumn === "order") comparison = comparePipelineRowsByDisplayOrder(a, b);
        if (sortColumn === "name") comparison = a.pipeline.name.localeCompare(b.pipeline.name);
        if (sortColumn === "classification") {
          comparison = getClassificationLabel(a.config?.classification).localeCompare(getClassificationLabel(b.config?.classification));
        }
        if (sortColumn === "stages") comparison = (a.pipeline.stages?.length || 0) - (b.pipeline.stages?.length || 0);
        if (sortColumn === "status") {
          comparison = Number(a.config?.is_active !== false) - Number(b.config?.is_active !== false);
        }
        if (sortColumn === "updated") {
          comparison = new Date(a.config?.updated_at || 0).getTime() - new Date(b.config?.updated_at || 0).getTime();
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [allRows, classificationFilter, searchTerm, sortColumn, sortDirection, statusFilter]);

  const handleSort = (column: PipelineSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (column: PipelineSortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === "asc" ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />;
  };

  const mergeSavedConfigs = (savedConfigs: PipelineConfig[]) => {
    setConfigs((current) => {
      const configMap = new Map(current.map((item) => [item.ghl_pipeline_id, item]));
      savedConfigs.forEach((config) => configMap.set(config.ghl_pipeline_id, config));
      return Array.from(configMap.values());
    });
  };

  const buildConfigInput = (row: PipelineRow, displayOrder: number) => ({
    locationId,
    ghlPipelineId: row.pipeline.id,
    nameSnapshot: row.pipeline.name,
    classification: row.config?.classification || "unclassified",
    accountTypeRule: row.config?.account_type_rule || null,
    includeTags: row.config?.include_tags || [],
    excludeTags: row.config?.exclude_tags || [],
    isActive: row.config?.is_active ?? true,
    displayOrder,
    notes: row.config?.notes || null,
  });

  const handleMovePipeline = async (pipelineId: string, direction: "up" | "down") => {
    if (!locationId) return;
    if (!isPipelineOrderingAvailable) {
      toast({
        title: "Pipeline Ordering Unavailable",
        description: "Pipeline ordering will be available after the latest database update finishes.",
      });
      return;
    }

    const row = allRows.find((item) => item.pipeline.id === pipelineId);
    if (!row) return;

    const section = getPipelineDisplaySection(row.config);
    const sectionRows = orderedRowsBySection[section];
    const currentIndex = sectionRows.findIndex((item) => item.pipeline.id === pipelineId);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sectionRows.length) return;

    const reorderedRows = [...sectionRows];
    const [movedRow] = reorderedRows.splice(currentIndex, 1);
    reorderedRows.splice(nextIndex, 0, movedRow);

    setSavingOrderPipelineId(pipelineId);
    try {
      const savedConfigs = await Promise.all(
        reorderedRows.map((item, index) => savePipelineConfig(buildConfigInput(item, (index + 1) * 10))),
      );
      mergeSavedConfigs(savedConfigs);
      toast({
        title: "Pipeline Order Updated",
        description: `${getPipelineDisplaySectionLabel(row.config)} pipelines have been reordered.`,
      });
    } catch (error) {
      if (isMissingPipelineDisplayOrderError(error)) {
        setIsPipelineOrderingAvailable(false);
        toast({
          title: "Pipeline Ordering Unavailable",
          description: "Pipeline ordering will be available after the latest database update finishes.",
        });
        return;
      }

      toast({
        title: "Pipeline Order Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not save the pipeline order."),
        variant: "destructive",
      });
    } finally {
      setSavingOrderPipelineId(null);
    }
  };

  const handleConfigSaved = (config: PipelineConfig) => {
    mergeSavedConfigs([config]);
    setEditingPipeline(null);
  };

  return (
    <div className="flex flex-col space-y-6 p-6">
      <PipelineConfigSheet
        open={Boolean(editingPipeline)}
        onOpenChange={(open) => !open && setEditingPipeline(null)}
        locationId={locationId}
        pipeline={editingPipeline}
        config={editingPipeline ? getConfigForPipeline(configs, editingPipeline.id) : null}
        onSaved={handleConfigSaved}
      />

      <div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Pipelines</h2>
          <p className="text-sm text-muted-foreground">
            Classify pipelines so Lawbric knows whether to show them under Leads or Matters.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search pipelines..."
            className="rounded-full pl-9"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:w-[28rem]">
          <Select value={classificationFilter} onValueChange={(value) => setClassificationFilter(value as PipelineClassification | "all")}>
            <SelectTrigger className="rounded-full">
              <span>
                {classificationFilter === "all" ? "All Types" : getClassificationLabel(classificationFilter)}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PIPELINE_CLASSIFICATIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as PipelineStatusFilter)}>
            <SelectTrigger className="rounded-full">
              <span>{statusFilter === "all" ? "All Statuses" : statusFilter === "active" ? "Active" : "Inactive"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="rounded-full">
          {rows.length} {rows.length === 1 ? "pipeline" : "pipelines"}
        </Badge>
        <Button type="button" variant="outline" className="rounded-full lg:ml-auto" onClick={loadPipelineData} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SlidersHorizontal className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading pipelines...</span>
        </div>
      ) : pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-20 text-center">
          <GitBranch className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium text-muted-foreground">No pipelines found</h3>
          <p className="max-w-md text-sm text-muted-foreground/70">
            Create pipelines, then refresh this page to configure where they appear in Lawbric.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80" onClick={() => handleSort("order")}>
                  <div className="flex items-center">Order {renderSortIcon("order")}</div>
                </th>
                <th className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80" onClick={() => handleSort("name")}>
                  <div className="flex items-center">Pipeline {renderSortIcon("name")}</div>
                </th>
                <th className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80" onClick={() => handleSort("classification")}>
                  <div className="flex items-center">Section {renderSortIcon("classification")}</div>
                </th>
                <th className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80" onClick={() => handleSort("stages")}>
                  <div className="flex items-center">Stages {renderSortIcon("stages")}</div>
                </th>
                <th className="h-12 px-4 py-4 font-medium">Rules</th>
                <th className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80" onClick={() => handleSort("status")}>
                  <div className="flex items-center">Status {renderSortIcon("status")}</div>
                </th>
                <th className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80" onClick={() => handleSort("updated")}>
                  <div className="flex items-center">Updated {renderSortIcon("updated")}</div>
                </th>
                <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { pipeline, config } = row;
                const section = getPipelineDisplaySection(config);
                const sectionRows = orderedRowsBySection[section];
                const orderIndex = sectionRows.findIndex((item) => item.pipeline.id === pipeline.id);
                const isSavingOrder = savingOrderPipelineId === pipeline.id;
                const isOrderDisabled = Boolean(savingOrderPipelineId) || !isPipelineOrderingAvailable;
                const canMoveUp = orderIndex > 0 && !isOrderDisabled;
                const canMoveDown = orderIndex >= 0 && orderIndex < sectionRows.length - 1 && !isOrderDisabled;

                return (
                  <tr key={pipeline.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                          {orderIndex >= 0 ? orderIndex + 1 : "-"}
                        </span>
                        <div className="flex items-center rounded-full border bg-background">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-r-none text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                            onClick={() => handleMovePipeline(pipeline.id, "up")}
                            disabled={!canMoveUp}
                            aria-label={`Move ${pipeline.name} up`}
                            tooltip={`Move ${pipeline.name} up`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-l-none text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                            onClick={() => handleMovePipeline(pipeline.id, "down")}
                            disabled={!canMoveDown}
                            aria-label={`Move ${pipeline.name} down`}
                            tooltip={`Move ${pipeline.name} down`}
                          >
                            {isSavingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDown className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                          <GitBranch className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[#2384CA]">{pipeline.name}</div>
                          <div className="text-xs text-muted-foreground">{getPipelineDisplaySectionLabel(config)} order</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={cn("border-transparent", getClassificationClass(config?.classification))}
                      >
                        {getClassificationLabel(config?.classification)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-foreground/80">{pipeline.stages?.length || 0}</td>
                    <td className="max-w-sm px-4 py-2 text-xs text-muted-foreground">
                      <div className="space-y-1">
                        <div>Account Type: {config?.account_type_rule || "Any"}</div>
                        <div>Include Tags: {config?.include_tags?.length ? config.include_tags.join(", ") : "-"}</div>
                        <div>Exclude Tags: {config?.exclude_tags?.length ? config.exclude_tags.join(", ") : "-"}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={cn("border-transparent", config?.is_active === false ? "bg-slate-100 text-slate-700" : "bg-green-100 text-green-800")}>
                        {config?.is_active === false ? "Inactive" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-foreground/70">
                      {config?.updated_at ? new Date(config.updated_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                        onClick={() => setEditingPipeline(pipeline)}
                        aria-label={`Edit ${pipeline.name}`}
                        tooltip={`Edit ${pipeline.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PipelineConfigSheet({
  open,
  onOpenChange,
  locationId,
  pipeline,
  config,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  pipeline: GhlPipeline | null;
  config: PipelineConfig | null;
  onSaved: (config: PipelineConfig) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [classification, setClassification] = useState<PipelineClassification>("unclassified");
  const [accountTypeRule, setAccountTypeRule] = useState("Any");
  const [includeTags, setIncludeTags] = useState("");
  const [excludeTags, setExcludeTags] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setClassification(config?.classification || "unclassified");
    setAccountTypeRule(config?.account_type_rule || "Any");
    setIncludeTags(formatTagRule(config?.include_tags));
    setExcludeTags(formatTagRule(config?.exclude_tags));
    setIsActive(config?.is_active ?? true);
    setNotes(config?.notes || "");
  }, [config, open]);

  const handleSave = async () => {
    if (!pipeline || !locationId) return;

    setSubmitting(true);
    try {
      const saved = await savePipelineConfig({
        locationId,
        ghlPipelineId: pipeline.id,
        nameSnapshot: pipeline.name,
        classification,
        accountTypeRule: accountTypeRule === "Any" ? null : accountTypeRule,
        includeTags: parseTagRule(includeTags),
        excludeTags: parseTagRule(excludeTags),
        isActive,
        notes: notes.trim() || null,
      });

      onSaved(saved);
      toast({ title: "Pipeline Updated", description: `${pipeline.name} has been configured.` });
    } catch (error) {
      toast({
        title: "Pipeline Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not save this pipeline configuration."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Configure Pipeline</SheetTitle>
          <SheetDescription>
            {pipeline ? `Set Lawbric rules for ${pipeline.name}.` : "Set Lawbric pipeline rules."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Lawbric Section</Label>
            <Select
              value={classification}
              onValueChange={(value) => setClassification(value as PipelineClassification)}
            >
              <SelectTrigger>
                <span>{getClassificationLabel(classification)}</span>
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_CLASSIFICATIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Account Type Rule</Label>
            <Select
              value={accountTypeRule}
              onValueChange={setAccountTypeRule}
            >
              <SelectTrigger>
                <span>{accountTypeRule}</span>
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Required Contact Tags</Label>
            <Input
              value={includeTags}
              onChange={(event) => setIncludeTags(event.target.value)}
              placeholder="Comma-separated tags"
            />
            <p className="text-xs text-muted-foreground">Optional. Contact must have at least one of these tags.</p>
          </div>

          <div className="space-y-2">
            <Label>Excluded Contact Tags</Label>
            <Input
              value={excludeTags}
              onChange={(event) => setExcludeTags(event.target.value)}
              placeholder="Comma-separated tags"
            />
            <p className="text-xs text-muted-foreground">Optional. Contact with these tags can be excluded from this section.</p>
          </div>

          <div className="space-y-2">
            <Label>Active In Lawbric</Label>
            <Select value={isActive ? "active" : "inactive"} onValueChange={(value) => setIsActive(value === "active")}>
              <SelectTrigger>
                <span>{isActive ? "Active" : "Inactive"}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional setup notes"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1 hover:bg-[#0484C8]" onClick={handleSave} disabled={submitting || !pipeline}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Pipeline
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
