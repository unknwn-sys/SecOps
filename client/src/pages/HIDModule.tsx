import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Play, Square, Plus, Trash2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function HIDModule() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [moduleAvailable, setModuleAvailable] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [, setLocation] = useLocation();

  // Fetch HID payloads from API
  const { data: payloadResponse, refetch: refetchPayloads } = trpc.payload.list.useQuery({ type: "hid" });
  const payloads = payloadResponse?.data || [];

  // Check module status (moved out of router - using window fetch for safety)
  useEffect(() => {
    const checkModuleStatus = async () => {
      try {
        setIsLoadingStatus(true);
        const response = await fetch("/api/trpc/system.getModuleStatus");
        const data = await response.json();
        // Handle tRPC response format
        const status = data?.result?.data || data;
        setModuleAvailable(status?.hid === true);
      } catch (error) {
        console.warn("Could not detect HID module status:", error);
        setModuleAvailable(false);
      } finally {
        setIsLoadingStatus(false);
      }
    };
    
    checkModuleStatus();
    // Re-check every 10 seconds for hot-plugging detection
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

  const handleCreatePayload = () => {
    setLocation("/payloads");
  };

  const handleExecutePayload = (payload: any) => {
    if (!moduleAvailable) {
      toast.error("HID module not available. Connect ESP32-S3 to enable.");
      return;
    }
    setIsExecuting(true);
    toast.success(`Executing payload: ${payload.name}`);
    setTimeout(() => setIsExecuting(false), 3000);
  };

  const handleDeletePayload = (id: string) => {
    deleteMutation.mutate({ id, type: "hid" });
  };

  const handleViewPayloadManager = () => {
    setLocation("/payloads");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">HID Injection Module</h1>
        <p className="text-muted-foreground">Create and execute keystroke injection payloads</p>
      </div>

      {!isLoadingStatus && !moduleAvailable && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">HID Module Not Detected</p>
              <p className="text-xs text-destructive/80 mt-1">
                ESP32-S3 microcontroller is not connected. Payloads can be created, but execution requires a connected device.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingStatus && moduleAvailable && (
        <Card className="bg-accent/10 border-accent/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <p className="text-sm text-accent">✓ HID Module Detected - Ready to execute</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            Payload Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleCreatePayload} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="w-4 h-4 mr-2" />
            Manage Payloads
          </Button>

          {payloads.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">No HID payloads created yet</p>
              <Button onClick={handleViewPayloadManager} variant="outline" className="border-border">
                Go to Payload Manager
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {payloads.map((payload) => (
                <div key={payload.id} className="p-4 bg-background rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{payload.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{payload.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleExecutePayload(payload)} disabled={isExecuting}>
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeletePayload(payload.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border border-accent/30 bg-accent/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-accent">
            <AlertCircle className="w-5 h-5" />
            Create HID Payloads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Use the Payload Manager to create, edit, and manage HID injection payloads. Templates and custom payloads are managed in one centralized location.
          </p>
          <Button onClick={handleViewPayloadManager} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            Open Payload Manager
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
