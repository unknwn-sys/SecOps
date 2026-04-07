import { Badge } from "@/components/ui/badge";
import { ReactNode } from "react";

interface ModuleCardProps {
  name: string;
  status: "idle" | "running" | "paused" | "error";
  icon: ReactNode;
}

export default function ModuleCard({ name, status, icon }: ModuleCardProps) {
  const statusStyles = {
    idle: "bg-muted text-muted-foreground border-muted/30",
    running: "bg-success/10 text-success border-success/30",
    paused: "bg-warning/10 text-warning border-warning/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
  };

  return (
    <div className="p-4 bg-background rounded-lg border border-border hover:border-accent/50 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-accent">{icon}</div>
        <h3 className="font-semibold text-foreground">{name}</h3>
      </div>
      <Badge className={statusStyles[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    </div>
  );
}
