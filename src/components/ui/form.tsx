import { ReactNode, createContext, useContext } from "react";
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FormItemContext = createContext<{ name: string } | null>(null);

export const Form = FormProvider;

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormItemContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormItemContext.Provider>
  );
}

export function FormItem({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("space-y-2", className)}>{children}</div>;
}

export function FormLabel({ className, children }: { className?: string; children: ReactNode }) {
  const context = useContext(FormItemContext);
  return (
    <Label htmlFor={context?.name} className={className}>
      {children}
    </Label>
  );
}

export function FormControl({ children }: { children: ReactNode }) {
  return children;
}

export function FormMessage({ className }: { className?: string }) {
  const context = useContext(FormItemContext);
  const {
    formState: { errors },
  } = useFormContext();

  if (!context) return null;

  const error = errors[context.name];
  const message = typeof error?.message === "string" ? error.message : null;

  if (!message) return null;

  return <p className={cn("text-xs text-destructive", className)}>{message}</p>;
}
