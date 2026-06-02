import { createContext, ReactNode, useContext } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AlertDialogContext = createContext<{ onOpenChange: (open: boolean) => void } | null>(null);

export function AlertDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AlertDialogContext.Provider value={{ onOpenChange }}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {children}
      </Dialog>
    </AlertDialogContext.Provider>
  );
}

export const AlertDialogContent = DialogContent;
export const AlertDialogHeader = DialogHeader;
export const AlertDialogTitle = DialogTitle;
export const AlertDialogDescription = DialogDescription;
export const AlertDialogFooter = DialogFooter;

export function AlertDialogCancel({ children }: { children: ReactNode }) {
  const context = useContext(AlertDialogContext);
  return (
    <Button type="button" variant="outline" onClick={() => context?.onOpenChange(false)}>
      {children}
    </Button>
  );
}

export function AlertDialogAction({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button type="button" onClick={onClick}>
      {children}
    </Button>
  );
}
