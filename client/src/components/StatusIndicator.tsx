import { ReactNode } from "react";

type StatusType = "online" | "offline" | "running" | "error" | "idle";

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
}

export default function StatusIndicator({
  status,
  label,
  size = "md",
  showLabel = false,
  animated = true,
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  const statusColors = {
    online: "bg-success",
    offline: "bg-muted",
    running: "bg-accent",
    error: "bg-destructive",
    idle: "bg-muted",
  };

  const statusLabels = {
    online: "Online",
    offline: "Offline",
    running: "Running",
    error: "Error",
    idle: "Idle",
  };

  const displayLabel = label || statusLabels[status];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} rounded-full ${statusColors[status]} ${
          animated && (status === "online" || status === "running" || status === "error")
            ? "animate-pulse"
            : ""
        }`}
      />
      {showLabel && <span className="text-sm text-foreground">{displayLabel}</span>}
    </div>
  );
}
