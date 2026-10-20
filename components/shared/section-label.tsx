import * as React from "react";

import { cn } from "@/lib/utils";

interface SectionLabelProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  /** Right-aligned control, e.g. a "View all" link. */
  action?: React.ReactNode;
}

/** A section heading in the annotation voice: a mono label running into a hairline. */
export function SectionLabel({ title, action, className, ...props }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      <h2 className="label-mono">{title}</h2>
      <div className="h-px flex-1 bg-border" aria-hidden />
      {action}
    </div>
  );
}
