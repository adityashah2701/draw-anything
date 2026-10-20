import * as React from "react";

import { cn } from "@/lib/utils";

interface EmptySheetProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons. The first should be the one next step. */
  children?: React.ReactNode;
}

/** The empty state for every list: a blank dotted sheet that says what to do next. */
export function EmptySheet({ title, description, children, className, ...props }: EmptySheetProps) {
  return (
    <div className={cn("bg-sheet flex flex-col items-start justify-end rounded-lg border px-6 py-8 sm:min-h-64 sm:px-10", className)} {...props}>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
