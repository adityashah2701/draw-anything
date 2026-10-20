import * as React from "react";

import { cn } from "@/lib/utils";

/** A keyboard shortcut, set in the annotation voice. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border bg-muted px-1 font-mono text-[10px] leading-none font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
