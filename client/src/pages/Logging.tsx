import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Trash2, Filter } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Logging() {
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>();
  const { data: logs = [] } = trpc.logging.getLogs.useQuery({ status: selectedStatus as any, limit: 100 });
  const { data: stats } = trpc.logging.getStats.useQuery();
  const exportQuery = trpc.logging.exportLogs.useQuery({ format: "json" }, { enabled: false });
  const clearMutation = trpc.logging.clearLogs.useMutation();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success/10 text-success border-success/30';
      case 'failed': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'in_progress': return 'bg-accent/10 text-accent border-accent/30';
      default: return 'bg-muted/10 text-muted border-muted/30';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Activity Logs</h1>
        <p className="text-muted-foreground">Centralized logging and monitoring of all operations</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Logs</p>
              <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-success mt-1">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-destructive mt-1">{stats.failed}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold text-accent mt-1">{stats.inProgress}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Initiated</p>
              <p className="text-2xl font-bold text-warning mt-1">{stats.initiated}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            Activity Log ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={selectedStatus === undefined ? "default" : "outline"} onClick={() => setSelectedStatus(undefined)} className={selectedStatus === undefined ? "bg-accent text-accent-foreground" : "border-border"}>
              <Filter className="w-3 h-3 mr-1" /> All
            </Button>
            <Button size="sm" variant={selectedStatus === 'completed' ? "default" : "outline"} onClick={() => setSelectedStatus('completed')} className={selectedStatus === 'completed' ? "bg-success text-white" : "border-border"}>
              Completed
            </Button>
            <Button size="sm" variant={selectedStatus === 'failed' ? "default" : "outline"} onClick={() => setSelectedStatus('failed')} className={selectedStatus === 'failed' ? "bg-destructive text-white" : "border-border"}>
              Failed
            </Button>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="border-border" onClick={() => exportQuery.refetch()} disabled={exportQuery.isFetching}>
                <Download className="w-4 h-4 mr-2" /> Export
              </Button>
              <Button size="sm" variant="destructive" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
                <Trash2 className="w-4 h-4 mr-2" /> Clear
              </Button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No activity logs</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(logs as any[]).map((log, idx) => (
                <div key={idx} className="p-4 bg-background rounded-lg border border-border hover:border-accent/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{log.action}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{log.startedAt ? new Date(log.startedAt).toLocaleString() : 'N/A'}</p>
                    </div>
                    <Badge className={getStatusColor(log.status)}>{log.status.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
