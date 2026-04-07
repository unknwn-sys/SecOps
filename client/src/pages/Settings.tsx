import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const devicesConnected = false; // No real devices detected on dev machine

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">System Settings</h1>
        <p className="text-muted-foreground">Configure hardware and module parameters</p>
      </div>

      {!devicesConnected && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">No IoT Devices Connected</p>
              <p className="text-xs text-destructive/80 mt-1">
                Hardware devices (ESP32, Raspberry Pi, RFID reader) are not connected. Connect a device to configure hardware settings.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border opacity-60">
          <CardHeader>
            <CardTitle className="text-base">ESP32-S3 Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Status</label>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-sm font-medium text-foreground">Disconnected</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground italic">
              Connect ESP32-S3 to configure
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border opacity-60">
          <CardHeader>
            <CardTitle className="text-base">Raspberry Pi Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Status</label>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-sm font-medium text-foreground">Disconnected</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground italic">
              Connect Raspberry Pi to configure
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border opacity-60">
          <CardHeader>
            <CardTitle className="text-base">RFID Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Status</label>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-sm font-medium text-foreground">Disconnected</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground italic">
              Connect RFID reader to configure
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-accent" />
            Network Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <SettingsIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Network settings will appear when a device is connected
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border opacity-60">
        <CardHeader>
          <CardTitle>Module Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <SettingsIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Module status will display when devices are connected and initialized
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="p-4 bg-muted/50 rounded-lg border border-border text-sm text-muted-foreground">
        <p><strong>Note:</strong> To configure hardware settings, connect your IoT devices (Raspberry Pi Zero 2W, ESP32-S3, RFID reader). Settings will be saved automatically when devices are connected.</p>
      </div>
    </div>
  );
}
