import React, { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Trash2, Download, Plus, Search, Upload, FileIcon } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type PayloadType = "hid" | "rfid" | "wifi" | "lan" | "generic";

interface Payload {
  id: string;
  name: string;
  type: PayloadType;
  description: string;
  content: Record<string, any>;
  tags: string[];
  encrypted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function PayloadManager() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<PayloadType>("hid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPayload, setSelectedPayload] = useState<Payload | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    content: "{}",
    encrypt: false,
    tags: "",
  });

  // Queries
  const payloadsQuery = trpc.payload.list.useQuery({ type: activeTab });
  const templatesQuery = trpc.payload.getTemplatesByType.useQuery({ type: activeTab });
  const statsQuery = trpc.payload.stats.useQuery();

  // Mutations
  const createMutation = trpc.payload.create.useMutation({
    onSuccess: () => {
      payloadsQuery.refetch();
      setFormData({ name: "", description: "", content: "{}", encrypt: false, tags: "" });
      setShowCreateForm(false);
    },
  });

  const deleteMutation = trpc.payload.delete.useMutation({
    onSuccess: () => {
      payloadsQuery.refetch();
      setSelectedPayload(null);
    },
  });

  const duplicateMutation = trpc.payload.duplicate.useMutation({
    onSuccess: () => {
      payloadsQuery.refetch();
    },
  });

  const createFromTemplateMutation = trpc.payload.createFromTemplate.useMutation({
    onSuccess: (data: any) => {
      payloadsQuery.refetch();
      const payloadName = data?.payload?.name || data?.name || "New Payload";
      toast.success(`Payload "${payloadName}" created from template!`);
      // Navigate to module page based on type
      const moduleMap: Record<PayloadType, string> = {
        hid: "/hid",
        rfid: "/rfid",
        wifi: "/wifi",
        lan: "/lan",
        generic: "/payloads",
      };
      setTimeout(() => {
        setLocation(moduleMap[activeTab]);
      }, 500);
    },
    onError: (error: any) => {
      toast.error(`Failed to create payload: ${error?.message || "Unknown error"}`);
    },
  });

  const searchMutation = trpc.payload.search.useMutation();
  const exportMutation = trpc.payload.export.useQuery({ type: activeTab }, { enabled: false });

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim()) {
      await searchMutation.mutateAsync({ query: searchQuery, type: activeTab });
    }
  }, [searchQuery, activeTab, searchMutation]);

  const handleCreatePayload = async () => {
    try {
      const content = JSON.parse(formData.content);
      await createMutation.mutateAsync({
        name: formData.name,
        type: activeTab,
        description: formData.description,
        content,
        tags: formData.tags.split(",").map((t) => t.trim()),
        encrypt: formData.encrypt,
      });
    } catch (error) {
      alert("Invalid JSON content or form data");
    }
  };

  const handleDeletePayload = (payload: Payload) => {
    deleteMutation.mutate({ id: payload.id, type: payload.type });
  };

  const handleDuplicate = (payload: Payload) => {
    duplicateMutation.mutate({ id: payload.id, type: payload.type });
  };

  const handleCreateFromTemplate = (templateId: string, templateName: string) => {
    createFromTemplateMutation.mutate({
      type: activeTab,
      templateId,
      customName: `${templateName} - Copy`,
    });
  };

  const handleExportPayloads = () => {
    const data = searchMutation.data || payloadsQuery.data?.data || [];
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payloads-${activeTab}-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return <div className="p-4 text-center text-red-500">Please log in to access Payload Manager</div>;
  }

  const displayPayloads = searchMutation.data || payloadsQuery.data?.data || [];

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Payload Manager</h1>
          <p className="text-slate-400">Create, manage, and organize attack payloads</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-400">Total Payloads</div>
          <div className="text-2xl font-bold">{statsQuery.data?.totalPayloads || 0}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={() => setShowCreateForm(!showCreateForm)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Payload
        </Button>
        <Button variant="outline" onClick={handleExportPayloads} className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Search payloads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button variant="outline" onClick={handleSearch} className="gap-2">
            <Search className="w-4 h-4" />
            Search
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="p-4 border-blue-500 bg-slate-900">
          <h2 className="text-xl font-bold mb-4">Create New Payload</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Payload Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Windows CMD Execution"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this payload does..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
              <Input
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="e.g., windows, cmd, execution"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Content (JSON)</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono text-sm"
                rows={6}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Enter JSON content..."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="encrypt"
                checked={formData.encrypt}
                onChange={(e) => setFormData({ ...formData, encrypt: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="encrypt" className="text-sm cursor-pointer">
                Encrypt this payload
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreatePayload}
                disabled={createMutation.isPending || !formData.name || !formData.content}
                className="flex-1"
              >
                {createMutation.isPending ? "Creating..." : "Create Payload"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>

            {createMutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{createMutation.error.message}</AlertDescription>
              </Alert>
            )}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(tab) => setActiveTab(tab as PayloadType)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="hid">HID</TabsTrigger>
          <TabsTrigger value="rfid">RFID</TabsTrigger>
          <TabsTrigger value="wifi">WiFi</TabsTrigger>
          <TabsTrigger value="lan">LAN</TabsTrigger>
          <TabsTrigger value="generic">Generic</TabsTrigger>
        </TabsList>

        {["hid", "rfid", "wifi", "lan", "generic"].map((type) => (
          <TabsContent key={type} value={type} className="space-y-4">
            {/* Templates Section */}
            {Object.entries(templatesQuery.data || {}).length > 0 && (
              <Card className="p-4 border-green-500/50 bg-green-950/10">
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <FileIcon className="w-4 h-4" />
                  Available Templates
                </h3>
                <div className="grid gap-2">
                  {Object.entries(templatesQuery.data || {}).map(([templateId, template]) => (
                    <div key={templateId} className="flex items-start justify-between p-3 bg-slate-800 rounded border border-slate-700 hover:border-slate-600">
                      <div className="flex-1">
                        <h4 className="font-semibold">{template.name}</h4>
                        <p className="text-sm text-slate-400">{template.description}</p>
                        {template.metadata && (
                          <div className="text-xs text-slate-500 mt-2">
                            {template.metadata.requires && <div>Requires: {template.metadata.requires.join(", ")}</div>}
                            {template.metadata.riskLevel && (
                              <div>
                                Risk Level:{" "}
                                <Badge
                                  variant="secondary"
                                  className={
                                    template.metadata.riskLevel >= 4
                                      ? "bg-red-900"
                                      : template.metadata.riskLevel >= 3
                                      ? "bg-yellow-900"
                                      : "bg-green-900"
                                  }
                                >
                                  {template.metadata.riskLevel}/5
                                </Badge>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleCreateFromTemplate(templateId, template.name)}
                        disabled={createFromTemplateMutation.isPending}
                        className="ml-2"
                      >
                        Use Template
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Payloads List */}
            <div className="space-y-2">
              <h3 className="text-lg font-bold">Your Payloads ({displayPayloads.length})</h3>

              {displayPayloads.length === 0 ? (
                <Card className="p-8 text-center text-slate-400">No payloads found. Create one or use a template.</Card>
              ) : (
                displayPayloads.map((payload) => (
                  <div
                    key={payload.id}
                    className={`p-4 rounded border cursor-pointer transition ${
                      selectedPayload?.id === payload.id
                        ? "border-blue-500 bg-blue-950/20"
                        : "border-slate-700 bg-slate-900 hover:border-slate-600"
                    }`}
                    onClick={() => setSelectedPayload(payload)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold text-base">{payload.name}</h4>
                        <p className="text-sm text-slate-400">{payload.description}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {payload.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="bg-slate-700 text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {payload.encrypted && <Badge className="bg-red-900 text-xs">🔒 Encrypted</Badge>}
                        </div>
                        <div className="text-xs text-slate-500 mt-2">
                          Created: {new Date(payload.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(payload);
                          }}
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => e.stopPropagation()}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogTitle>Delete Payload</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure? This will permanently delete "{payload.name}".
                            </AlertDialogDescription>
                            <div className="flex gap-2">
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeletePayload(payload)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </div>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Preview content on selection */}
                    {selectedPayload?.id === payload.id && (
                      <div className="mt-4 pt-4 border-t border-slate-700">
                        <h5 className="font-semibold text-sm mb-2">Payload Content (JSON)</h5>
                        <pre className="bg-slate-800 p-3 rounded text-xs overflow-x-auto text-slate-300">
                          {JSON.stringify(payload.content, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
