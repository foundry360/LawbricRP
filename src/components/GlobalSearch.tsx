import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Briefcase, CheckSquare, Loader2, MousePointerClick, Search, Sparkles, UserRound } from "lucide-react";
import { getCachedBusinessesIfAvailable, getCachedContactsIfAvailable, getContacts, type GhlBusiness } from "@/lib/api";
import { listCases, type CaseRecord } from "@/lib/cases";
import { formatPersonName } from "@/lib/names";
import { listTasks, type TaskRecord } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type GlobalSearchProps = {
  locationId?: string;
  disabled?: boolean;
};

type GlobalSearchResult = {
  id: string;
  type: "contact" | "company" | "matter" | "task";
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
};

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getContactName(contact: any) {
  const rawName = `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() || contact?.name || "";
  return formatPersonName(rawName) || contact?.email || "Unknown contact";
}

function getContactSubtitle(contact: any) {
  return [contact?.email, contact?.phone].map((value) => String(value || "").trim()).filter(Boolean).join(" • ");
}

function getBusinessSubtitle(business: GhlBusiness) {
  return [business.email, business.phone].map((value) => String(value || "").trim()).filter(Boolean).join(" • ");
}

function getTaskHref(task: TaskRecord) {
  if (task.case_id) return `/case/${task.case_id}`;
  if (task.ghl_contact_id) return `/contact/${task.ghl_contact_id}`;
  return "/tasks";
}

function buildKeywords(...values: Array<unknown>) {
  return values.map((value) => String(value || "").toLowerCase()).join(" ");
}

const resultTypeConfig = {
  contact: { label: "Contact", icon: UserRound },
  company: { label: "Company", icon: Building2 },
  matter: { label: "Matter", icon: Briefcase },
  task: { label: "Task", icon: CheckSquare },
} as const;

const GLOBAL_SEARCH_MIN_CHARS = 3;
const GLOBAL_SEARCH_GHL_MIN_CHARS = 5;
const GLOBAL_SEARCH_DEBOUNCE_MS = 400;

function mapContactsToResults(contacts: any[]): GlobalSearchResult[] {
  return contacts.flatMap((contact: any): GlobalSearchResult[] => {
    const id = String(contact?.id || contact?._id || "");
    if (!id) return [];
    const title = getContactName(contact);
    const subtitle = getContactSubtitle(contact);
    return [
      {
        id,
        type: "contact" as const,
        title,
        subtitle,
        href: `/contact/${id}`,
        keywords: buildKeywords(title, subtitle, contact?.tags?.join?.(" ")),
      },
    ];
  });
}

function mapBusinessesToResults(businesses: GhlBusiness[]): GlobalSearchResult[] {
  return businesses.flatMap((business: GhlBusiness): GlobalSearchResult[] => {
    const id = String(business?.id || "");
    if (!id) return [];
    const title = business.name || "Unknown company";
    const subtitle = getBusinessSubtitle(business);
    return [
      {
        id,
        type: "company" as const,
        title,
        subtitle,
        href: `/company/${id}`,
        keywords: buildKeywords(title, subtitle, business.address, business.website),
      },
    ];
  });
}

function mapCasesToResults(cases: CaseRecord[]): GlobalSearchResult[] {
  return cases.map((caseRecord: CaseRecord) => ({
    id: caseRecord.id,
    type: "matter" as const,
    title: caseRecord.case_name || caseRecord.case_number || "Untitled matter",
    subtitle: [caseRecord.case_number, caseRecord.primary_contact_name, caseRecord.case_type]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" • "),
    href: `/case/${caseRecord.id}`,
    keywords: buildKeywords(
      caseRecord.case_name,
      caseRecord.case_number,
      caseRecord.primary_contact_name,
      caseRecord.primary_contact_email,
      caseRecord.case_type,
      caseRecord.status,
    ),
  }));
}

function mapTasksToResults(tasks: TaskRecord[]): GlobalSearchResult[] {
  return tasks.map((task: TaskRecord) => ({
    id: task.id,
    type: "task" as const,
    title: task.title || "Untitled task",
    subtitle: [task.case?.case_name, task.ghl_contact_name, task.status]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" • "),
    href: getTaskHref(task),
    keywords: buildKeywords(
      task.title,
      task.description,
      task.case?.case_name,
      task.ghl_contact_name,
      task.ghl_opportunity_name,
      task.status,
      task.priority,
    ),
  }));
}

export function GlobalSearch({ locationId, disabled }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [appResults, setAppResults] = useState<GlobalSearchResult[]>([]);
  const [crmResults, setCrmResults] = useState<GlobalSearchResult[]>([]);
  const [isLoadingAppResults, setIsLoadingAppResults] = useState(false);
  const [isLoadingCrmResults, setIsLoadingCrmResults] = useState(false);
  const [hasLoadedAppResults, setHasLoadedAppResults] = useState(false);
  const [hasCheckedCachedCrmResults, setHasCheckedCachedCrmResults] = useState(false);
  const [hasLoadedRemoteCrmContacts, setHasLoadedRemoteCrmContacts] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearAndCloseSearch = () => {
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), GLOBAL_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      clearAndCloseSearch();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearAndCloseSearch();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setAppResults([]);
    setCrmResults([]);
    setHasLoadedAppResults(false);
    setHasCheckedCachedCrmResults(false);
    setHasLoadedRemoteCrmContacts(false);
    setErrorMessage("");
  }, [locationId]);

  useEffect(() => {
    if (!locationId || disabled || hasLoadedAppResults || debouncedQuery.length < GLOBAL_SEARCH_MIN_CHARS) return;

    let isMounted = true;
    setIsLoadingAppResults(true);
    setErrorMessage("");

    Promise.allSettled([
      listCases({ limit: 100 }),
      listTasks({ limit: 100 }),
    ])
      .then(([casesResult, tasksResult]) => {
        if (!isMounted) return;

        const cases = casesResult.status === "fulfilled" ? casesResult.value : [];
        const tasks = tasksResult.status === "fulfilled" ? tasksResult.value : [];

        setAppResults([...mapCasesToResults(cases), ...mapTasksToResults(tasks)]);
        setHasLoadedAppResults(true);
        if ([casesResult, tasksResult].some((result) => result.status === "rejected")) {
          setErrorMessage("Some results could not be loaded.");
        }
      })
      .catch((error) => {
        console.error("Global search failed", error);
        if (isMounted) setErrorMessage("Search is unavailable right now.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingAppResults(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery.length, disabled, hasLoadedAppResults, locationId]);

  useEffect(() => {
    if (!locationId || disabled || hasCheckedCachedCrmResults || debouncedQuery.length < GLOBAL_SEARCH_MIN_CHARS) return;

    const cachedContacts = getCachedContactsIfAvailable(locationId);
    const cachedBusinesses = getCachedBusinessesIfAvailable(locationId);

    setCrmResults([
      ...mapContactsToResults(getArrayFromResponse(cachedContacts, "contacts")),
      ...mapBusinessesToResults(getArrayFromResponse(cachedBusinesses, "businesses")),
    ]);
    setHasCheckedCachedCrmResults(true);
  }, [debouncedQuery.length, disabled, hasCheckedCachedCrmResults, locationId]);

  useEffect(() => {
    if (
      !locationId ||
      disabled ||
      hasLoadedRemoteCrmContacts ||
      debouncedQuery.length < GLOBAL_SEARCH_GHL_MIN_CHARS
    ) {
      return;
    }

    let isMounted = true;
    setIsLoadingCrmResults(true);

    getContacts(locationId)
      .then((response) => {
        if (!isMounted) return;
        const contactResults = mapContactsToResults(getArrayFromResponse(response, "contacts"));
        setCrmResults((current) => [
          ...current.filter((result) => result.type !== "contact"),
          ...contactResults,
        ]);
        setHasLoadedRemoteCrmContacts(true);
      })
      .catch((error) => {
        console.error("Global contact search failed", error);
        if (isMounted) setErrorMessage("Some CRM contact results could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingCrmResults(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery.length, disabled, hasLoadedRemoteCrmContacts, locationId]);

  const filteredResults = useMemo(() => {
    const search = debouncedQuery.toLowerCase();
    if (search.length < GLOBAL_SEARCH_MIN_CHARS) return [];

    return [...appResults, ...crmResults]
      .filter((result) => result.keywords.includes(search))
      .sort((left, right) => {
        const leftStarts = left.title.toLowerCase().startsWith(search) ? 0 : 1;
        const rightStarts = right.title.toLowerCase().startsWith(search) ? 0 : 1;
        return leftStarts - rightStarts || left.title.localeCompare(right.title);
      })
      .slice(0, 10);
  }, [appResults, crmResults, debouncedQuery]);

  const shouldShowPanel = open && query.trim().length > 0;
  const isLoading = isLoadingAppResults || isLoadingCrmResults;
  const noResultsMessage =
    debouncedQuery.length >= GLOBAL_SEARCH_MIN_CHARS && debouncedQuery.length < GLOBAL_SEARCH_GHL_MIN_CHARS
      ? `No app results found. Type at least ${GLOBAL_SEARCH_GHL_MIN_CHARS} characters to include CRM contacts.`
      : "No results found.";

  const handleResultSelect = (result: GlobalSearchResult) => {
    clearAndCloseSearch();
    navigate(result.href);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-header-foreground/50" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled || !locationId}
          placeholder="Search"
          className="h-9 w-full rounded-full border border-header-foreground/10 bg-header-foreground/[0.08] pl-9 pr-3 text-sm text-header-foreground outline-none placeholder:text-header-foreground/45 transition-colors focus:border-header-foreground/20 focus:bg-header-foreground/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {shouldShowPanel ? (
        <div className="absolute left-1/2 top-full z-[80] mt-2 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-xl">
          <div className="grid grid-cols-2">
            <div className="min-w-0 p-3">
              {debouncedQuery.length < GLOBAL_SEARCH_MIN_CHARS ? (
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  Type at least {GLOBAL_SEARCH_MIN_CHARS} characters to search.
                </div>
              ) : filteredResults.length > 0 ? (
                <div className="no-scrollbar max-h-[28rem] divide-y divide-border overflow-y-auto">
                  {filteredResults.map((result) => {
                    const config = resultTypeConfig[result.type];
                    const Icon = config.icon;
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                        onClick={() => handleResultSelect(result)}
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: "#F0F6FF", color: "#344256" }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-normal">{result.title}</div>
                          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {config.label}
                            </span>
                            {result.subtitle ? <span className="truncate">{result.subtitle}</span> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {isLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching more records...
                    </div>
                  ) : null}
                </div>
              ) : isLoading ? (
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : (
                <div className="px-4 py-4 text-sm text-muted-foreground">{noResultsMessage}</div>
              )}

              {errorMessage ? (
                <div className={cn("mt-2 border-t px-4 py-3 text-xs text-muted-foreground", filteredResults.length === 0 && "border-t-0")}>
                  {errorMessage}
                </div>
              ) : null}
            </div>

            <div className="border-l p-6" style={{ backgroundColor: "#F0F6FF" }}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#344256" }}>
                <Sparkles className="h-4 w-4" style={{ color: "#344256" }} />
                Search Tips
              </div>
              <div className="mt-4 space-y-4 text-sm text-slate-600">
                <div className="flex gap-3">
                  <Search className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#344256" }} />
                  <p>Search by name, email, matter number, task title, or practice area.</p>
                </div>
                <div className="flex gap-3">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#344256" }} />
                  <p>Matters and tasks load first. More specific searches can include CRM contacts.</p>
                </div>
                <div className="flex gap-3">
                  <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#344256" }} />
                  <p>Select a result to jump directly to its record.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
