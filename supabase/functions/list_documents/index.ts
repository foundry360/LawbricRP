import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  canViewMatter,
  corsHeaders,
  getCaseOrThrow,
  getDocumentCapabilities,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  userHasPermission,
} from "../_shared/case-utils.ts";

const DOCUMENT_SELECT = `
  *,
  case:cases!documents_case_id_fkey(id, location_id, case_number, case_name, assigned_user_id, source_attorney_user_id, created_by),
  uploaded_user:profiles!documents_uploaded_by_fkey(id, full_name, email),
  updated_user:profiles!documents_updated_by_fkey(id, full_name, email)
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    const caseId = body.caseId || body.matterId;
    const limit = Math.min(Number(body.limit) || 500, 1000);
    const capabilities = await getDocumentCapabilities(context);

    if (!await userHasPermission(context, "documents.view")) {
      return jsonResponse({ ok: true, documents: [], capabilities });
    }

    let query = context.supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("location_id", context.location.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (caseId) {
      const caseRow = await getCaseOrThrow(context, caseId);
      query = query.eq("case_id", caseRow.id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const documents = caseId
      ? rows
      : (
        await Promise.all(
          rows.map(async (document: any) => await canViewMatter(context, document.case) ? document : null),
        )
      ).filter(Boolean);

    return jsonResponse({
      ok: true,
      documents,
      capabilities,
    });
  } catch (error) {
    return handleError(error);
  }
});
