import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, getRequestContext, handleError, jsonResponse, readJsonBody } from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    const limit = Math.min(Number(body.limit) || 100, 200);

    let query = context.supabase
      .from("cases")
      .select("*")
      .eq("location_id", context.location.id)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (body.status && body.status !== "all") query = query.eq("status", body.status);
    if (body.caseType && body.caseType !== "all") query = query.eq("case_type", body.caseType);
    if (body.search) {
      const term = String(body.search).replaceAll("%", "").trim();
      if (term) query = query.or(`case_name.ilike.%${term}%,case_number.ilike.%${term}%,primary_contact_name.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return jsonResponse({ ok: true, cases: data ?? [] });
  } catch (error) {
    return handleError(error);
  }
});
