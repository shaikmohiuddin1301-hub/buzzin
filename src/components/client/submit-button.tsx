"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, cn } from "@/components/ui";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  disabled,
  confirmMessage,
  ...rest
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "creative" | "positive" | "caution" | "subtle";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  confirmMessage?: string;
} & Omit<React.ComponentProps<"button">, "className" | "children" | "disabled">) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        rest.onClick?.(event);
      }}
      className={cn(buttonClass(variant, size), className)}
    >
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          <span>{pendingLabel ?? "Working…"}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function SubmitIconButton({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={pending}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-navy-500 transition hover:bg-navy-100 hover:text-navy-800 disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
