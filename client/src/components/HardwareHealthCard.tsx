import { Badge } from "@/components/ui/badge";
import { Thermometer } from "lucide-react";

interface HardwareHealthCardProps {
  name: string;
  status: "online" | "offline" | "error";
  cpuUsage: number;
  memoryUsage: number;
  temperature: number;
}

export default function HardwareHealthCard({
  name,
  status,
  cpuUsage,
  memoryUsage,
  temperature,
}: HardwareHealthCardProps) {
  const statusColor = {
    online: "bg-success/10 text-success border-success/30",
    offline: "bg-muted/10 text-muted border-muted/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
  };

  const getProgressColor = (value: number) => {
    if (value < 50) return "bg-success";
    if (value < 75) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div className="p-4 bg-background rounded-lg border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{name}</h3>
        <Badge className={statusColor[status]}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>
      <div className="space-y-3">
        {/* CPU Usage */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">CPU Usage</span>
            <span className="text-xs font-medium text-foreground">{cpuUsage}%</span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(cpuUsage)} transition-all duration-300`}
              style={{ width: `${cpuUsage}%` }}
            />
          </div>
        </div>

        {/* Memory Usage */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">Memory</span>
            <span className="text-xs font-medium text-foreground">{memoryUsage}%</span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(memoryUsage)} transition-all duration-300`}
              style={{ width: `${memoryUsage}%` }}
            />
          </div>
        </div>

        {/* Temperature */}
        <div className="flex items-center gap-2 pt-2">
          <Thermometer className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-foreground">{temperature}°C</span>
        </div>
      </div>
    </div>
  );
}
