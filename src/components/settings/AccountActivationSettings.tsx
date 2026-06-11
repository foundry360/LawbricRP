import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearCachedAppLocationContext, clearCachedGhlListData, clearCachedGhlReferenceData } from "@/lib/api";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneInput, formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

type AgencyRow = {
  id: string;
  name?: string | null;
};

type LocationRow = {
  id: string;
  agency_id?: string | null;
  ghl_location_id?: string | null;
};

type BusinessProfileRow = {
  id: string;
  agency_id?: string | null;
  location_id?: string | null;
  business_name?: string | null;
  address?: string | null;
  website_url?: string | null;
  phone?: string | null;
};

type AccountActivationFormData = {
  subAccountApiKey: string;
  businessName: string;
  address: string;
  websiteUrl: string;
  phone: string;
  ghlLocationId: string;
  agencyId: string;
  locationId: string;
};

const initialFormData: AccountActivationFormData = {
  subAccountApiKey: "",
  businessName: "",
  address: "",
  websiteUrl: "",
  phone: "",
  ghlLocationId: "",
  agencyId: "",
  locationId: "",
};

export function AccountActivationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agencies, setAgencies] = useState<AgencyRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [businessProfiles, setBusinessProfiles] = useState<BusinessProfileRow[]>([]);
  const [formData, setFormData] = useState<AccountActivationFormData>(initialFormData);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [agenciesRes, locationsRes, profilesRes] = await Promise.all([
        supabase.from("agencies").select("id, name"),
        supabase.from("ghl_locations").select("id, agency_id, ghl_location_id"),
        supabase
          .from("business_profiles")
          .select("id, agency_id, location_id, business_name, address, website_url, phone"),
      ]);

      let finalLocationsRes = locationsRes;
      if (locationsRes.error && locationsRes.error.message.includes("permission denied")) {
        finalLocationsRes = await supabase
          .from("user_accessible_locations")
          .select("id, agency_id, ghl_location_id");
      }

      if (agenciesRes.error) throw agenciesRes.error;
      if (finalLocationsRes.error) throw finalLocationsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const agencyRows = agenciesRes.data ?? [];
      const locationRows = (finalLocationsRes.data ?? []) as LocationRow[];
      const profileRows = profilesRes.data ?? [];

      setAgencies(agencyRows);
      setLocations(locationRows);
      setBusinessProfiles(profileRows);

      const profile = profileRows[0];

      if (profile) {
        const location = locationRows.find((item) => item.id === profile.location_id);
        setFormData((prev) => ({
          ...prev,
          businessName: profile.business_name ?? "",
          address: profile.address ?? "",
          websiteUrl: profile.website_url ?? "",
          phone: formatPhoneNumber(profile.phone, ""),
          ghlLocationId: location?.ghl_location_id ?? "",
          agencyId: profile.agency_id ?? "",
          locationId: profile.location_id ?? "",
        }));
        return;
      }

      if (locationRows[0]) {
        const location = locationRows[0];
        setFormData((prev) => ({
          ...prev,
          ghlLocationId: location.ghl_location_id ?? "",
          locationId: location.id,
          agencyId: location.agency_id ?? "",
        }));
        return;
      }

      if (agencyRows.length === 1) {
        setFormData((prev) => ({
          ...prev,
          agencyId: agencyRows[0].id,
        }));
      }
    } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        "Could not load Account Activation settings. Please refresh and try again.",
      );
      console.error("Error fetching account activation data:", error);
      toast({
        title: "Error loading Account Activation",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!formData.subAccountApiKey && !formData.locationId) {
      toast({ title: "Sub-Account API Key is required", variant: "destructive" });
      return;
    }

    if (!formData.ghlLocationId) {
      toast({ title: "GHL Location ID is required", variant: "destructive" });
      return;
    }

    if (!formData.businessName) {
      toast({ title: "Business Name is required", variant: "destructive" });
      return;
    }

    if (formData.websiteUrl && !/^https?:\/\//i.test(formData.websiteUrl)) {
      toast({ title: "Website URL must start with http:// or https://", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        action: "upsertBusinessProfile",
        agencyId: formData.agencyId || undefined,
        locationId: formData.locationId || undefined,
        businessName: formData.businessName,
        address: formData.address,
        websiteUrl: formData.websiteUrl,
        phone: formatPhoneNumber(formData.phone, ""),
        ghlLocationId: formData.ghlLocationId,
        privateIntegrationApiKey: formData.subAccountApiKey || undefined,
      };

      const { data, error } = await supabase.functions.invoke("admin-settings", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (formData.subAccountApiKey) {
        toast({
          title: "API Key Saved",
          description: "The Sub-Account API Key has been saved securely to the backend.",
          duration: 5000,
        });
        setFormData((prev) => ({ ...prev, subAccountApiKey: "" }));
      }

      toast({ title: "Account Activation settings saved successfully" });
      clearCachedAppLocationContext();
      clearCachedGhlReferenceData();
      clearCachedGhlListData();
      await fetchData();
    } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        "Could not save Account Activation settings. Please check the fields and try again.",
      );
      console.error("Error saving account activation:", error);
      toast({
        title: "Failed to save Account Activation",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Found {agencies.length} agency record{agencies.length === 1 ? "" : "s"},{" "}
        {locations.length} location record{locations.length === 1 ? "" : "s"}, and{" "}
        {businessProfiles.length} business profile record{businessProfiles.length === 1 ? "" : "s"}.
      </div>

      <div className="space-y-2">
        <Label htmlFor="subAccountApiKey">
          Sub-Account Private Integration API Key{" "}
          {!formData.locationId && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="subAccountApiKey"
          type="password"
          value={formData.subAccountApiKey}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, subAccountApiKey: event.target.value }))
          }
          placeholder={
            formData.locationId
              ? "Leave blank to keep existing saved key"
              : "Enter Sub-Account API Key"
          }
        />
        <p className="text-xs text-muted-foreground">
          Email sending requires a sub-account Private Integration token with the
          {" "}
          <span className="font-medium text-foreground">conversations/message.write</span>
          {" "}
          scope. Gmail must also be connected inside GHL for the location.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ghlLocationId">
          GHL Location ID <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ghlLocationId"
          value={formData.ghlLocationId}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, ghlLocationId: event.target.value }))
          }
          placeholder="Enter GHL Location ID"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessName">
          Business Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="businessName"
          value={formData.businessName}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, businessName: event.target.value }))
          }
          placeholder="Enter business name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Business Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(event) => setFormData((prev) => ({ ...prev, address: event.target.value }))}
          placeholder="Enter full address"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="websiteUrl">Website URL</Label>
        <Input
          id="websiteUrl"
          type="url"
          value={formData.websiteUrl}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, websiteUrl: event.target.value }))
          }
          placeholder="https://example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Business Phone</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(event) => setFormData((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }))}
          placeholder="(555) 000-0000"
        />
      </div>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Account Activation
      </Button>
    </form>
  );
}
