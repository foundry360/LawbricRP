import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { disconnectGoogleDrive, getGoogleDriveStatus, type GoogleDriveIntegrationStatus } from "@/lib/google-drive";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-10 w-10">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.4 0-9.9-3.4-11.4-8.1L6 33c3.4 6.5 10.1 11 18 11z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function ConnectedAppsPage() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [googleDriveStatus, setGoogleDriveStatus] = useState<GoogleDriveIntegrationStatus | null>(null);
  const [isGoogleDriveLoading, setIsGoogleDriveLoading] = useState(true);
  const [isGoogleDriveDisconnecting, setIsGoogleDriveDisconnecting] = useState(false);
  const loadInFlightRef = useRef<Promise<GoogleDriveIntegrationStatus | null> | null>(null);
  const returnUrl = typeof window !== "undefined" ? window.location.origin : undefined;

  const loadGoogleDriveStatus = useCallback(async (options?: { silent?: boolean; showErrorToast?: boolean }) => {
    if (loadInFlightRef.current) return loadInFlightRef.current;

    const silent = options?.silent ?? false;
    const showErrorToast = options?.showErrorToast ?? !silent;

    if (!silent) setIsGoogleDriveLoading(true);

    const request = (async () => {
      try {
        const status = await getGoogleDriveStatus(returnUrl);
        setGoogleDriveStatus(status);
        return status;
      } catch (error) {
        if (showErrorToast) {
          toastRef.current({
            title: "Google Drive unavailable",
            description: getUserFriendlyErrorMessage(error, "Could not load the Google Drive connection."),
            variant: "destructive",
          });
        }
        return null;
      } finally {
        if (!silent) setIsGoogleDriveLoading(false);
        loadInFlightRef.current = null;
      }
    })();

    loadInFlightRef.current = request;
    return request;
  }, [returnUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("google_drive");
    const message = params.get("google_drive_message");

    if (oauthResult) {
      params.delete("google_drive");
      params.delete("google_drive_message");
      const nextSearch = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
    }

    void (async () => {
      const status = await loadGoogleDriveStatus({
        silent: true,
        showErrorToast: !oauthResult,
      });

      if (!oauthResult) return;

      if (oauthResult === "connected") {
        toastRef.current({
          title: "Google Drive connected",
          description: message || "Your location is connected to Google Drive.",
        });
        return;
      }

      if (status?.connected) {
        toastRef.current({
          title: "Google Drive connected",
          description: "Your Google account is connected. Lawbric will finish folder setup automatically.",
        });
        return;
      }

      toastRef.current({
        title: "Google Drive connection failed",
        description: message || "Could not connect Google Drive.",
        variant: "destructive",
      });
    })();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleDriveConnect = () => {
    if (!googleDriveStatus?.configured || !googleDriveStatus.authUrl) {
      toast({
        title: "Google Drive is not configured",
        description: "Add the Google OAuth client ID, client secret, and redirect URI before connecting.",
        variant: "destructive",
      });
      return;
    }

    window.open(googleDriveStatus.authUrl, "_blank", "noopener,noreferrer");
  };

  const handleGoogleDriveDisconnect = async () => {
    try {
      setIsGoogleDriveDisconnecting(true);
      await disconnectGoogleDrive();
      toastRef.current({ title: "Google Drive disconnected" });
      await loadGoogleDriveStatus({ silent: true });
    } catch (error) {
      toastRef.current({
        title: "Google Drive not disconnected",
        description: getUserFriendlyErrorMessage(error, "Could not disconnect Google Drive."),
        variant: "destructive",
      });
    } finally {
      setIsGoogleDriveDisconnecting(false);
    }
  };

  const isGoogleDriveConnected = Boolean(googleDriveStatus?.connected);
  const isGoogleDriveActionLoading = isGoogleDriveDisconnecting || (isGoogleDriveLoading && !googleDriveStatus);

  return (
    <div className="w-full p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Connected Apps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage external app connections used by Lawbric.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(320px,380px))]">
        <Card className="w-full transition-shadow hover:shadow-sm">
          <CardContent className="p-6 pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-background">
                <GoogleLogo />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">Google Drive</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  Create and open Lawbric matter folders in Google Drive.
                </p>
              </div>
            </div>
            <div className="my-5 h-px bg-border" />
            <Button
              type="button"
              variant="outline"
              className="w-full border-gray-300 bg-transparent"
              disabled={isGoogleDriveActionLoading}
              onClick={isGoogleDriveConnected ? handleGoogleDriveDisconnect : handleGoogleDriveConnect}
            >
              {isGoogleDriveActionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isGoogleDriveConnected ? (
                <Unplug className="mr-2 h-4 w-4" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {isGoogleDriveConnected ? "Disconnect" : "Connect"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
