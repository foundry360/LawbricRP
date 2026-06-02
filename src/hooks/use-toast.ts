type ToastVariant = "default" | "destructive";

export type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ToastInput = Omit<ToastMessage, "id">;

export const toastEventName = "lawbric:toast";

export function useToast() {
  return {
    toast(message: ToastInput) {
      window.dispatchEvent(
        new CustomEvent<ToastMessage>(toastEventName, {
          detail: {
            id: crypto.randomUUID(),
            duration: 3500,
            variant: "default",
            ...message,
          },
        }),
      );
    },
  };
}
