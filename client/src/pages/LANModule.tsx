import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, Play, Square, AlertCircle } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function LANModule() {
  const [isScanning, setIsScanning] = useState(false);

  // Queries
  const { data: devices = [], refetch: refetchDevices } = trpc.lan.getDiscoveredDevices.useQuery();

  // Mutations
  const startScanMutation = trpc.lan.startScan.useMutation({
    onSuccess: () => {
      setIsScanning(true);
      toast.success("LAN scan started");
      setTimeout(() => {
        setIsScanning(false);
        refetchDevices();
        toast.success("LAN scan completed");
      }, 5000);
    },
    onError: () => {
      toast.error("Failed to start scan");
    },
  });

  const stopScanMutation = trpc.lan.stopScan.useMutation({
    onSuccess: () => {
      setIsScanning(false);
      toast.success("LAN scan stopped");
    },
  });

  const handleStartScan = () => {
    startScanMutation.mutate();
  };

  const handleStopScan = () => {
    stopScanMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">LAN Implantation Module</h1>
        <p className="text-muted-foreground">Network scanning, device enumeration, and payload deployment</p>
      </div>

      <Card className="bg-accent/5 border-accent/30">
        <CardContent className="flex items-center gap-3 pt-6">
          <AlertCircle className="w-5 h-5 text-accent flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-accent">Device Detection Active</p>
            <p className="text-xs text-accent/80 mt-1">
              Start a LAN scan to discover network devices and available targets for payload deployment.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-accent" />
            Network Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={handleStartScan} disabled={isScanning} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Play className="w-4 h-4 mr-2" />
              {isScanning ? "Scanning..." : "Start Scan"}
            </Button>
            <Button onClick={handleStopScan} disabled={!isScanning} variant="outline" className="border-border">
              <Square className="w-4 h-4 mr-2" />
              Stop Scan
            </Button>
          </div>

          {isScanning && (
            <div className="flex items-center gap-2 p-3 bg-accent/10 rounded-lg border border-accent/30">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm text-accent">Scanning network...</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Discovered Devices ({devices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-12">
              <Network className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">No devices discovered</p>
              <p className="text-sm text-muted-foreground">Run a network scan to find available targets</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device, idx) => (
                <div key={idx} className="p-4 bg-background rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{(device as any).hostname || 'Unknown'}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{(device as any).ip}</p>
                    </div>
                    <Badge variant="outline">{(device as any).os || 'Unknown'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border opacity-60">
        <CardHeader>
          <CardTitle>Payload Deployment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Discover devices first, then select a target for payload deployment
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
