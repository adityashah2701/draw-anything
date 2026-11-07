import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "../team-model";

export function PersonAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string; className?: string }) {
  return (
    <Avatar aria-hidden className={cn("size-8", className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt="" />}
      <AvatarFallback className="bg-muted font-mono text-[11px] font-medium text-muted-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

