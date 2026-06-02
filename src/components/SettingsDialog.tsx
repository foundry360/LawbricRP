import { useEffect, useState } from "react";
import { AccountActivationSettings } from "@/components/settings/AccountActivationSettings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Key, Loader2, Upload, User } from "lucide-react";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
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
          setEmail(user.email || "");
          setFirstName(user.user_metadata?.first_name || "");
          setLastName(user.user_metadata?.last_name || "");
          setAvatarUrl(user.user_metadata?.avatar_url || "");
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
      const message = error instanceof Error ? error.message : "Upload failed";
      toast({
        title: "Upload failed",
        description: message.includes("Bucket not found")
          ? "Please create a public 'avatars' bucket in your storage settings."
          : `Error: ${message}`,
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
        title: "Error",
        description: "Image is still uploading or failed to upload. Please try uploading again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        avatar_url: avatarUrl,
        first_name: firstName,
        last_name: lastName,
      },
    });
    setIsLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Profile saved successfully." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl overflow-hidden p-0">
        <div className="flex h-[600px]">
          <aside className="flex w-64 flex-col gap-2 border-r bg-muted/30 p-6">
            <h2 className="mb-4 font-semibold">Settings</h2>
            <nav className="flex flex-col gap-2">
              <Button
                variant="ghost"
                className={`justify-between hover:bg-transparent ${
                  activeTab === "profile" ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setActiveTab("profile")}
              >
                <div className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </div>
                {activeTab === "profile" && <div className="h-2 w-2 rounded-full bg-green-500" />}
              </Button>

              <Button
                variant="ghost"
                className={`justify-between hover:bg-transparent ${
                  activeTab === "integration" ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setActiveTab("integration")}
              >
                <div className="flex items-center">
                  <Key className="mr-2 h-4 w-4" />
                  Account Activation
                </div>
                {activeTab === "integration" && <div className="h-2 w-2 rounded-full bg-green-500" />}
              </Button>
            </nav>
          </aside>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-medium">User Profile</h3>
                </div>
                <div className="max-w-2xl space-y-6">
                  <div className="flex flex-col gap-4">
                    <Label>Avatar Image</Label>
                    <div className="flex items-center gap-6">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={avatarUrl} />
                        <AvatarFallback>
                          {(firstName?.[0] || email?.[0] || "L").toUpperCase()}
                          {(lastName?.[0] || "B").toUpperCase()}
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
                <div className="max-w-3xl">
                  <AccountActivationSettings />
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
