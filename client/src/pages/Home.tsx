import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Cpu, 
  Activity,
  AlertCircle
} from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Home() {
  // Queries for real data (optional - backend stubbed for now)
  const { data: logs } = trpc.logging.getLogs.useQuery({ limit: 5 }, { queryFn: async () => [], retry: false, enabled: false });

  const devicesConnected = false; // No devices detected on dev machine

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Offensive security platform control and monitoring
        </p>
      </div>

      {!devicesConnected && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">No IoT Devices Connected</p>
              <p className="text-xs text-destructive/80 mt-1">
                Connect your Raspberry Pi, ESP32-S3, and RFID reader to start using the offensive security modules. Dashboard will display real-time device metrics once connected.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border opacity-60">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">System Status</p>
                <p className="text-2xl font-bold text-foreground mt-1">Standby</p>
              </div>
              <AlertCircle className="w-8 h-8 text-warning opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border opacity-60">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Modules</p>
                <p className="text-2xl font-bold text-foreground mt-1">0</p>
              </div>
              <Activity className="w-8 h-8 text-muted opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border opacity-60">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Devices Connected</p>
                <p className="text-2xl font-bold text-foreground mt-1">0</p>
              </div>
              <Shield className="w-8 h-8 text-muted opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border opacity-60">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="text-2xl font-bold text-foreground mt-1">-</p>
              </div>
              <AlertCircle className="w-8 h-8 text-muted opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hardware Health */}
      <Card className="bg-card border-border opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-accent" />
            Hardware Health
          </CardTitle>
          <CardDescription>Hardware metrics appear when devices are connected</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Cpu className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No hardware devices detected
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Module Status */}
      <Card className="bg-card border-border opacity-60">
        <CardHeader>
          <CardTitle>Module Status</CardTitle>
          <CardDescription>Module status appears when devices are connected</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Modules will be available once hardware is connected
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="bg-card border-border opacity-60">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>System events will appear here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No recent activity
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
