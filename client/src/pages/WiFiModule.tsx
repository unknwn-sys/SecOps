import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wifi, Play, Square, RefreshCw, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function WiFiModule() {
  const [isScanning, setIsScanning] = useState(false);
  const [isDeauthRunning, setIsDeauthRunning] = useState(false);
  const [isCaptureRunning, setIsCaptureRunning] = useState(false);
  const [moduleAvailable, setModuleAvailable] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Queries for WiFi payloads
  const { data: payloadResponse, refetch: refetchPayloads } = trpc.payload.list.useQuery({ type: "wifi" });
  const payloads = payloadResponse?.data || [];

  // Query for networks (from existing router)
  const { data: networks = [], refetch: refetchNetworks } = trpc.wifi.getNetworks.useQuery();

  // Check module status
  useEffect(() => {
    const checkModuleStatus = async () => {
      try {
        setIsLoadingStatus(true);
        const response = await fetch("/api/trpc/system.getModuleStatus");
        const data = await response.json();
        const status = data?.result?.data || data;
        setModuleAvailable(status?.wifi === true);
      } catch (error) {
        console.warn("Could not detect WiFi module status:", error);
        setModuleAvailable(false);
      } finally {
        setIsLoadingStatus(false);
      }
    };
    
    checkModuleStatus();
    const interval = setInterval(checkModuleStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Mutations
  const startScanMutation = trpc.wifi.startScan.useMutation({
    onSuccess: () => {
      setIsScanning(true);
      toast.success("WiFi scan started");
      setTimeout(() => {
        setIsScanning(false);
        refetchNetworks();
        toast.success("WiFi scan completed");
      }, 5000);
    },
    onError: (error) => {
      toast.error("Failed to start scan");
    },
  });

  const stopScanMutation = trpc.wifi.stopScan.useMutation({
    onSuccess: () => {
      setIsScanning(false);
      toast.success("WiFi scan stopped");
    },
  });

  const startDeauthMutation = trpc.wifi.startDeauth.useMutation({
    onSuccess: () => {
      setIsDeauthRunning(true);
      toast.success("Deauth attack started");
    },
    onError: () => {
      toast.error("Failed to start deauth attack");
    },
  });

  const stopDeauthMutation = trpc.wifi.stopDeauth.useMutation({
    onSuccess: () => {
      setIsDeauthRunning(false);
      toast.success("Deauth attack stopped");
    },
  });

  const startCaptureMutation = trpc.wifi.startCapture.useMutation({
    onSuccess: () => {
      setIsCaptureRunning(true);
      toast.success("Packet capture started");
    },
    onError: () => {
      toast.error("Failed to start packet capture");
    },
  });

  const stopCaptureMutation = trpc.wifi.stopCapture.useMutation({
    onSuccess: () => {
      setIsCaptureRunning(false);
      toast.success("Packet capture stopped");
    },
  });

  const handleStartScan = () => {
    if (!moduleAvailable) {
      toast.error("WiFi adapter not detected. Connect compatible WiFi hardware.");
      return;
    }
    startScanMutation.mutate();
  };

  const handleStopScan = () => {
    stopScanMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">WiFi Attack Module</h1>
        <p className="text-muted-foreground">
          Scan networks, perform deauth attacks, and capture packets
        </p>
      </div>

      {!isLoadingStatus && !moduleAvailable && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">WiFi Module Not Detected</p>
              <p className="text-xs text-destructive/80 mt-1">
                WiFi adapter is not connected. Operations can be configured, but execution requires a compatible adapter.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingStatus && moduleAvailable && (
        <Card className="bg-accent/10 border-accent/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <p className="text-sm text-accent">✓ WiFi Module Detected - Ready to operate</p>
          </CardContent>
        </Card>
      )}

      {/* Scanner Controls */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-accent" />
            Network Scanner
          </CardTitle>
          <CardDescription>Discover WiFi networks in range</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button
              onClick={handleStartScan}
              disabled={isScanning || startScanMutation.isPending}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <Play className="w-4 h-4 mr-2" />
              {startScanMutation.isPending ? "Starting..." : "Start Scan"}
            </Button>
            <Button
              onClick={handleStopScan}
              disabled={!isScanning || stopScanMutation.isPending}
              variant="outline"
              className="border-border"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Scan
            </Button>
            <Button
              onClick={() => refetchNetworks()}
              variant="ghost"
              className="ml-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {isScanning && (
            <div className="flex items-center gap-2 p-3 bg-accent/10 rounded-lg border border-accent/30">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm text-accent">Scanning for networks...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discovered Networks */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Discovered Networks ({networks.length})</CardTitle>
          <CardDescription>Available WiFi networks</CardDescription>
        </CardHeader>
        <CardContent>
          {networks.length === 0 ? (
            <div className="text-center py-12">
              <Wifi className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No networks discovered yet</p>
              <p className="text-sm text-muted-foreground">Start a scan to discover networks</p>
            </div>
          ) : (
            <div className="space-y-3">
              {networks.map((network: any, idx: number) => (
                <div
                  key={idx}
                  className="p-4 bg-background rounded-lg border border-border hover:border-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{network.ssid}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{network.bssid}</p>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      Ch {network.channel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Signal:</span>
                      <span className="text-sm font-medium">{network.signalStrength}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Security:</span>
                      <Badge variant="secondary" className="text-xs">
                        {network.encryption}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => {
                        startDeauthMutation.mutate({
                          targetBSSID: network.bssid,
                          targetSSID: network.ssid,
                        });
                      }}
                      disabled={isDeauthRunning}
                    >
                      Deauth
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => {
                        startCaptureMutation.mutate({ channel: network.channel });
                      }}
                      disabled={isCaptureRunning}
                    >
                      Capture
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attack Controls */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Attack Controls</CardTitle>
          <CardDescription>Configure and execute attacks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-background rounded-lg border border-border">
              <h3 className="font-semibold text-foreground mb-3">Deauthentication Attack</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Disconnect devices from a WiFi network
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-border"
                  onClick={() => {
                    if (isDeauthRunning) {
                      stopDeauthMutation.mutate();
                    }
                  }}
                  disabled={!isDeauthRunning}
                >
                  {isDeauthRunning ? "Stop Attack" : "Not Active"}
                </Button>
              </div>
              {isDeauthRunning && (
                <div className="flex items-center gap-2 mt-3 p-2 bg-destructive/10 rounded border border-destructive/30">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <span className="text-xs text-destructive">Attack in progress</span>
                </div>
              )}
            </div>
            <div className="p-4 bg-background rounded-lg border border-border">
              <h3 className="font-semibold text-foreground mb-3">Packet Capture</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Capture and analyze network traffic
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-border"
                  onClick={() => {
                    if (isCaptureRunning) {
                      stopCaptureMutation.mutate();
                    }
                  }}
                  disabled={!isCaptureRunning}
                >
                  {isCaptureRunning ? "Stop Capture" : "Not Active"}
                </Button>
              </div>
              {isCaptureRunning && (
                <div className="flex items-center gap-2 mt-3 p-2 bg-accent/10 rounded border border-accent/30">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs text-accent">Capturing packets</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
