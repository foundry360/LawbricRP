import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { disconnectGoogleDrive, getGoogleDriveStatus, type GoogleDriveIntegrationStatus } from "@/lib/google-drive";
import { getUserFriendlyErrorMessage } from "@/lib/errors";

type GoogleDriveSettingsProps = {
  compact?: boolean;
};

export function GoogleDriveSettings({ compact = false }: GoogleDriveSettingsProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<GoogleDriveIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setStatus(await getGoogleDriveStatus(window.location.origin));
    } catch (error) {
      setStatus(null);
      toast({
        title: "Could not load Google Drive",
        description: getUserFriendlyErrorMessage(error, "Google Drive settings could not be loaded."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = () => {
    if (!status?.authUrl) return;
    window.open(status.authUrl, "_blank", "noopener,noreferrer");
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      await disconnectGoogleDrive();
      toast({ title: "Google Drive disconnected" });
      await loadStatus();
    } catch (error) {
      toast({
        title: "Google Drive not disconnected",
        description: getUserFriendlyErrorMessage(error, "Could not disconnect Google Drive."),
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const connected = Boolean(status?.connected && status.integration);
  const rootFolderUrl = status?.integration?.rootFolderUrl || "";

  return (
    <div className="max-w-xl space-y-5">
      {!compact ? (
        <div>
          <h3 className="text-base font-medium">Google Drive</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a firm Google Drive account so Lawbric can create a Lawbric folder and matter folders automatically.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect a firm Google Drive account so Lawbric can create a Lawbric folder and matter folders automatically.
        </p>
      )}

      {!status?.configured ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Google Drive OAuth is not configured yet. Add the Google client ID, client secret, and redirect URI to Supabase secrets before connecting.
        </div>
      ) : null}

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">{connected ? "Connected" : "Not connected"}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {connected
                ? status?.integration?.googleAccountEmail || "Google Drive account connected"
                : "Connect Google Drive to enable automatic matter folders."}
            </div>
            {rootFolderUrl ? (
              <a
                href={rootFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center text-sm font-medium text-[#2384CA] hover:underline"
              >
                Open Lawbric folder
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          <div className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {connected ? "Active" : "Inactive"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleConnect} disabled={!status?.configured || !status?.authUrl}>
          {connected ? "Reconnect Google Drive" : "Connect Google Drive"}
        </Button>
        <Button type="button" variant="outline" onClick={loadStatus}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        {connected ? (
          <Button type="button" variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
            Disconnect
          </Button>
        ) : null}
      </div>
    </div>
  );
}
