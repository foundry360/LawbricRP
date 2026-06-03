import { FormEvent, ReactNode, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { getPasswordResetSkippedMessage } from "@/lib/password-reset";
import { formatPhoneInput, formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";

type LocationRow = {
  id: string;
  name?: string | null;
  location_name?: string | null;
  agency_id?: string | null;
};

type AddUserSheetProps = {
  locationId: string;
  onSuccess: () => void;
  children?: ReactNode;
};

export function AddUserSheet({ locationId, onSuccess, children }: AddUserSheetProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "user",
  });

  const fetchLocations = async () => {
    const { data: businessProfiles } = await supabase
      .from("business_profiles")
      .select("location_id")
      .limit(1);
    const businessProfileLocationId = businessProfiles?.[0]?.location_id as string | undefined;

    let { data: locationData, error } = await supabase.from("ghl_locations").select("*");
    if (error && error.message.includes("permission denied")) {
      const fallback = await supabase.from("user_accessible_locations").select("*");
      locationData = fallback.data;
      error = fallback.error;
    }

    if (error) {
      toast({
        title: "Could not load locations",
        description: getUserFriendlyErrorMessage(error, "Please complete Account Activation before adding users."),
        variant: "destructive",
      });
    }

    let nextLocations = (locationData ?? []) as LocationRow[];

    if (nextLocations.length === 0 && businessProfileLocationId) {
      nextLocations = [{ id: businessProfileLocationId, name: "Business Location" }];
    }

    if (nextLocations.length === 0 && locationId) {
      nextLocations = [{ id: locationId, name: "Current Location" }];
    }

    setLocations(nextLocations);

    if (businessProfileLocationId) {
      setSelectedLocations([businessProfileLocationId]);
    } else if (locationId) {
      setSelectedLocations([locationId]);
    } else if (nextLocations.length > 0) {
      setSelectedLocations([nextLocations[0].id]);
    } else {
      setSelectedLocations([]);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) fetchLocations();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      if (selectedLocations.length === 0) throw new Error("Please select at least one location.");

      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create",
          email: formData.email,
          fullName: `${formData.firstName} ${formData.lastName}`.trim(),
          phone: formatPhoneNumber(formData.phone, ""),
          role: formData.role,
          ghlRole: "user",
          locationIds: selectedLocations,
        },
      });

      if (error) {
        console.error("Supabase Edge Function Error:", error, error.context);
        throw new Error(error.message || "Failed to create user in backend");
      }

      if (data?.error) throw new Error(data.error);

      const resetSkippedReason =
        typeof data?.passwordResetSkippedReason === "string" ? data.passwordResetSkippedReason : undefined;

      toast({
        title: "User created",
        description: data?.passwordResetSent === false
          ? `The user was created. ${getPasswordResetSkippedMessage(resetSkippedReason)}`
          : "The user has been successfully created.",
      });

      setIsOpen(false);
      setSelectedLocations([]);
      setFormData({ firstName: "", lastName: "", email: "", phone: "", role: "user" });
      onSuccess();
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Failed to create user. Please try again.");
      console.error("Error creating user:", error);
      toast({
        variant: "destructive",
        title: "User Not Created",
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {children || (
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            aria-label="Add user"
            title="Add user"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[400px] overflow-y-auto p-6 sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">Add New User</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                required
                value={formData.firstName}
                onChange={(event) => setFormData({ ...formData, firstName: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                required
                value={formData.lastName}
                onChange={(event) => setFormData({ ...formData, lastName: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(event) => setFormData({ ...formData, email: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(event) => setFormData({ ...formData, phone: formatPhoneInput(event.target.value) })}
              placeholder="(555) 000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData({ ...formData, role: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {locations.length === 0 ? (
            <div className="space-y-2">
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                No locations found. Please complete Account Activation in Settings first.
              </div>
            </div>
          ) : locations.length > 1 ? (
            <div className="space-y-2">
              <Label>Locations</Label>
              <div className="space-y-2 rounded-md border border-border p-3">
                {locations.map((location) => (
                  <div key={location.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`loc-${location.id}`}
                      checked={selectedLocations.includes(location.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedLocations([...selectedLocations, location.id]);
                        } else {
                          setSelectedLocations(selectedLocations.filter((id) => id !== location.id));
                        }
                      }}
                    />
                    <Label htmlFor={`loc-${location.id}`} className="font-normal">
                      {location.name || location.location_name || location.id}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || locations.length === 0}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create User
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
