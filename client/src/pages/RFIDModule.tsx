import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Radio, Play, Square, Scan, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function RFIDModule() {
  const [isScanning, setIsScanning] = useState(false);
  const [moduleAvailable, setModuleAvailable] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Fetch RFID payloads from API
  const { data: payloadResponse, refetch: refetchPayloads } = trpc.payload.list.useQuery({ type: "rfid" });
  const payloads = payloadResponse?.data || [];
  const tags: any[] = []; // Empty for now - would populate from scanning

  // Check module status
  useEffect(() => {
    const checkModuleStatus = async () => {
      try {
        setIsLoadingStatus(true);
        const response = await fetch("/api/trpc/system.getModuleStatus");
        const data = await response.json();
        const status = data?.result?.data || data;
        setModuleAvailable(status?.rfid === true);
      } catch (error) {
        console.warn("Could not detect RFID module status:", error);
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
  const deleteMutation = trpc.payload.delete.useMutation({
    onSuccess: () => {
      refetchPayloads();
      toast.success("Payload deleted");
    },
    onError: () => {
      toast.error("Failed to delete payload");
    },
  });

  const handleStartScan = () => {
    if (!moduleAvailable) {
      toast.error("RFID reader not detected. Connect RFID module to enable.");
      return;
    }
    setIsScanning(true);
    toast.success("RFID scan started");
    setTimeout(() => {
      setIsScanning(false);
      toast.success("RFID scan completed");
    }, 5000);
  };

  const handleStopScan = () => {
    setIsScanning(false);
    toast.info("RFID scan stopped");
  };

  const handleDeletePayload = (id: string) => {
    deleteMutation.mutate({ id, type: "rfid" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">RFID Operations Module</h1>
        <p className="text-muted-foreground">Read, clone, replay, and emulate RFID tags</p>
      </div>

      {!isLoadingStatus && !moduleAvailable && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">RFID Module Not Detected</p>
              <p className="text-xs text-destructive/80 mt-1">
                RFID reader is not connected. Operations can be configured, but execution requires a connected reader module.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingStatus && moduleAvailable && (
        <Card className="bg-accent/10 border-accent/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <p className="text-sm text-accent">✓ RFID Module Detected - Ready to operate</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-accent" />
            Tag Scanner
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
              <span className="text-sm text-accent">Scanning for RFID tags...</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Discovered Tags ({tags.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <div className="text-center py-12">
              <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No tags discovered</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tags.map((tag, idx) => (
                <div key={idx} className="p-4 bg-background rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{tag.uid}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{tag.type}</p>
                    </div>
                    <Badge variant="outline">{tag.signal}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Clone Tag</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-border">Clone Selected</Button>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Emulate Tag</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-border">Start Emulation</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
