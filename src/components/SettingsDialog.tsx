import { useEffect, useState } from "react";
import { AccountActivationSettings } from "@/components/settings/AccountActivationSettings";
import { NoteRichTextBody, NoteRichTextEditor } from "@/components/NoteRichText";
import { TagSettings } from "@/components/settings/TagSettings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatFullName, formatPersonName } from "@/lib/names";
import { supabase } from "@/lib/supabase";
import { ImageIcon, Key, Loader2, PenLine, Tags, Upload, User } from "lucide-react";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SIGNATURE_TEXT_SIZE_OPTIONS = [
  { value: "small", label: "Small", className: "text-xs" },
  { value: "normal", label: "Normal", className: "text-sm" },
  { value: "large", label: "Large", className: "text-base" },
  { value: "x-large", label: "Extra Large", className: "text-lg" },
];

function isProfileAvatarMirrorError(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error) || typeof error.message !== "string") return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("avatar_url") ||
    message.includes("schema cache") ||
    message.includes("column") && message.includes("does not exist")
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [signatureLogoUrl, setSignatureLogoUrl] = useState("");
  const [signatureTextSize, setSignatureTextSize] = useState("normal");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      const loadUser = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setUserId(user.id);
          setEmail(user.email || "");
          setFirstName(user.user_metadata?.first_name || "");
          setLastName(user.user_metadata?.last_name || "");
          setAvatarUrl(user.user_metadata?.avatar_url || "");
          const { data: profile } = await supabase
            .from("profiles")
            .select("avatar_url, email_signature_enabled, email_signature_html, email_signature_logo_url, email_signature_text_size")
            .eq("id", user.id)
            .maybeSingle();
          setAvatarUrl(profile?.avatar_url || user.user_metadata?.avatar_url || "");
          setSignatureEnabled(Boolean(profile?.email_signature_enabled));
          setSignatureHtml(profile?.email_signature_html || "");
          setSignatureLogoUrl(profile?.email_signature_logo_url || "");
          setSignatureTextSize(profile?.email_signature_text_size || "normal");
        }
      };

      loadUser();
    }
  }, [open]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => setAvatarUrl(event.target?.result as string);
      reader.readAsDataURL(file);

      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      if (publicUrl) {
        setAvatarUrl(publicUrl);
        toast({ title: "Success", description: "Image uploaded successfully." });
      }
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "The image could not be uploaded. Please try again.");
      toast({
        title: "Upload failed",
        description: message.includes("Bucket not found")
          ? "Please create a public 'avatars' bucket in your storage settings."
          : message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files?.[0]) {
      handleFile(event.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleSaveProfile = async () => {
    if (avatarUrl.startsWith("data:")) {
      toast({
        title: "Image Still Uploading",
        description: "Image is still uploading or failed to upload. Please try uploading again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        avatar_url: avatarUrl,
        first_name: formatPersonName(firstName),
        last_name: formatPersonName(lastName),
      },
    });

    const fullName = formatFullName(firstName, lastName);
    const profileError = !error && userId
      ? (await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId)).error
      : null;
    const avatarMirrorError = !error && !profileError && userId
      ? (await supabase.from("profiles").update({ avatar_url: avatarUrl || null }).eq("id", userId)).error
      : null;
    setIsLoading(false);

    if (avatarMirrorError && isProfileAvatarMirrorError(avatarMirrorError)) {
      console.warn("Profile avatar mirror skipped while database updates are pending", avatarMirrorError);
    }

    const blockingError = error || profileError || (avatarMirrorError && !isProfileAvatarMirrorError(avatarMirrorError));

    if (blockingError) {
      toast({
        title: "Profile Not Saved",
        description: getUserFriendlyErrorMessage(blockingError, "Profile could not be saved. Please try again."),
        variant: "destructive",
      });
    } else {
      toast({ title: "Success", description: "Profile saved successfully." });
    }
  };

  const handleSignatureLogoFile = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const fileExt = file.name.split(".").pop() || "png";
      const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("email-signatures").upload(fileName, file, {
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("email-signatures").getPublicUrl(fileName);
      setSignatureLogoUrl(publicUrl);
      toast({ title: "Logo Uploaded", description: "The signature logo has been uploaded." });
    } catch (error) {
      toast({
        title: "Logo Not Uploaded",
        description: getUserFriendlyErrorMessage(error, "The logo could not be uploaded. Please try again."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSignature = async () => {
    if (!userId) return;
    setIsLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        email_signature_enabled: signatureEnabled,
        email_signature_html: signatureHtml || null,
        email_signature_logo_url: signatureLogoUrl || null,
        email_signature_text_size: signatureTextSize,
      })
      .eq("id", userId);
    setIsLoading(false);

    if (error) {
      toast({
        title: "Signature Not Saved",
        description: getUserFriendlyErrorMessage(error, "Could not save your email signature."),
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Signature Saved", description: "Your email signature has been saved." });
  };

  const userInitials = getAvatarInitials({
    firstName,
    lastName,
    email,
  });
  const signaturePreviewTextSizeClass =
    SIGNATURE_TEXT_SIZE_OPTIONS.find((option) => option.value === signatureTextSize)?.className || "text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px] overflow-hidden p-0">
        <div className="flex h-[600px]">
          <aside className="flex w-64 flex-shrink-0 flex-col gap-2 border-r bg-muted/30 p-6">
            <h2 className="mb-4 font-semibold">Settings</h2>
            <nav className="flex flex-col gap-2">
              <Button
                variant="ghost"
                className={`min-w-0 justify-between whitespace-nowrap hover:bg-transparent focus:ring-0 ${
                  activeTab === "profile" ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setActiveTab("profile")}
              >
                <div className="flex min-w-0 items-center">
                  <User className="mr-2 h-4 w-4 shrink-0" />
                  <span>Profile</span>
                </div>
                {activeTab === "profile" && <div className="h-2 w-2 rounded-full bg-green-500" />}
              </Button>

              <Button
                variant="ghost"
                className={`min-w-0 justify-between whitespace-nowrap hover:bg-transparent focus:ring-0 ${
                  activeTab === "integration" ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setActiveTab("integration")}
              >
                <div className="flex min-w-0 items-center">
                  <Key className="mr-2 h-4 w-4 shrink-0" />
                  <span>Account Activation</span>
                </div>
                {activeTab === "integration" && <div className="h-2 w-2 rounded-full bg-green-500" />}
              </Button>

              <Button
                variant="ghost"
                className={`min-w-0 justify-between whitespace-nowrap hover:bg-transparent focus:ring-0 ${
                  activeTab === "signature" ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setActiveTab("signature")}
              >
                <div className="flex min-w-0 items-center">
                  <PenLine className="mr-2 h-4 w-4 shrink-0" />
                  <span>Email Signature</span>
                </div>
                {activeTab === "signature" && <div className="h-2 w-2 rounded-full bg-green-500" />}
              </Button>

              <Button
                variant="ghost"
                className={`min-w-0 justify-between whitespace-nowrap hover:bg-transparent focus:ring-0 ${
                  activeTab === "tags" ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setActiveTab("tags")}
              >
                <div className="flex min-w-0 items-center">
                  <Tags className="mr-2 h-4 w-4 shrink-0" />
                  <span>Tags</span>
                </div>
                {activeTab === "tags" && <div className="h-2 w-2 rounded-full bg-green-500" />}
              </Button>
            </nav>
          </aside>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-medium">User Profile</h3>
                </div>
                <div className="max-w-xl space-y-6">
                  <div className="flex flex-col gap-4">
                    <Label>Avatar Image</Label>
                    <div className="flex items-center gap-6">
                      <Avatar className="h-20 w-20">
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${userInitials} avatar`} /> : null}
                        <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`flex-1 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                        }`}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => document.getElementById("avatar-upload")?.click()}
                      >
                        <input
                          id="avatar-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])}
                        />
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          {isLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : (
                            <Upload className="h-6 w-6" />
                          )}
                          <span className="text-sm font-medium">
                            {isLoading ? "Uploading..." : "Click to upload or drag and drop"}
                          </span>
                          <span className="text-xs">SVG, PNG, JPG or GIF (max. 5MB)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      <Input
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        placeholder="Enter first name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        placeholder="Enter last name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={email} disabled />
                  </div>

                  <Button onClick={handleSaveProfile} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "integration" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-medium">Account Activation Settings</h3>
                </div>
                <div className="max-w-2xl">
                  <AccountActivationSettings />
                </div>
              </div>
            )}

            {activeTab === "signature" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-medium">Email Signature</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a signature that is automatically appended to emails sent from matters.
                  </p>
                </div>
                <div className="max-w-2xl space-y-5">
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox checked={signatureEnabled} onCheckedChange={setSignatureEnabled} />
                    <span>
                      <span className="block text-sm font-medium">Enable automatic email signature</span>
                      <span className="block text-xs text-muted-foreground">Append this signature to outbound matter emails.</span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label>Signature Logo</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-28 items-center justify-center rounded-md border bg-muted/20">
                        {signatureLogoUrl ? (
                          <img src={signatureLogoUrl} alt="Email signature logo" className="max-h-14 max-w-24 object-contain" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById("signature-logo-upload")?.click()}
                          disabled={isLoading}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Logo
                        </Button>
                        {signatureLogoUrl ? (
                          <Button type="button" variant="ghost" onClick={() => setSignatureLogoUrl("")}>
                            Remove Logo
                          </Button>
                        ) : null}
                        <input
                          id="signature-logo-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => event.target.files?.[0] && handleSignatureLogoFile(event.target.files[0])}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Use a small PNG/JPG/SVG logo. Public HTTPS URLs render best in email clients.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Signature Text</Label>
                    <div className="max-w-xs space-y-2">
                      <Label className="text-xs text-muted-foreground">Text Size</Label>
                      <Select value={signatureTextSize} onValueChange={setSignatureTextSize}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIGNATURE_TEXT_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <NoteRichTextEditor
                      value={signatureHtml}
                      onChange={setSignatureHtml}
                      placeholder="Add your name, title, phone number, and disclaimer..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Preview</Label>
                    <div className="rounded-lg border bg-muted/10 p-4">
                      {signatureLogoUrl ? (
                        <img src={signatureLogoUrl} alt="Email signature logo preview" className="mb-3 max-h-16 max-w-40 object-contain" />
                      ) : null}
                      {signatureHtml ? (
                        <NoteRichTextBody value={signatureHtml} className={`${signaturePreviewTextSizeClass} text-foreground`} />
                      ) : (
                        <div className="text-sm text-muted-foreground">No signature text yet.</div>
                      )}
                    </div>
                  </div>

                  <Button onClick={handleSaveSignature} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Signature"}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "tags" && <TagSettings />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
