import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toastEventName, type ToastMessage } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function shouldShowSuccessIcon(toast: ToastMessage) {
  if (toast.variant === "destructive") return false;

  const text = `${toast.title} ${toast.description || ""}`;
  return /\b(created|updated|saved|configured|converted)\b/i.test(text);
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const toast = (event as CustomEvent<ToastMessage>).detail;
      setToasts((current) => [toast, ...current].slice(0, 3));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.duration ?? 3500);
    };

    window.addEventListener(toastEventName, onToast);
    return () => window.removeEventListener(toastEventName, onToast);
  }, []);

  return (
    <div className="fixed right-4 top-20 z-[200] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const showSuccessIcon = shouldShowSuccessIcon(toast);

        return (
          <div
            key={toast.id}
            className={cn(
              "rounded-lg border border-border bg-background p-4 text-sm shadow-lg",
              toast.variant === "destructive" && "border-destructive/40 text-destructive",
            )}
          >
            <div className="flex items-start gap-3">
              {showSuccessIcon && (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 fill-green-100 text-green-600" />
              )}
              <div className="min-w-0">
                <div className="font-semibold">{toast.title}</div>
                {toast.description && <div className="mt-1 text-muted-foreground">{toast.description}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
