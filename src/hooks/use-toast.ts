import { getUserFriendlyErrorMessage } from "@/lib/errors";

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
      const description =
        message.variant === "destructive" && message.description
          ? getUserFriendlyErrorMessage(message.description, message.description)
          : message.description;

      window.dispatchEvent(
        new CustomEvent<ToastMessage>(toastEventName, {
          detail: {
            id: crypto.randomUUID(),
            duration: 3500,
            variant: "default",
            ...message,
            description,
          },
        }),
      );
    },
  };
}
