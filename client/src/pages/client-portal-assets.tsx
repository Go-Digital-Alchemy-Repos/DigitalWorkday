import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { usePortalClient } from "@/hooks/use-portal-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, File as FileIcon, Folder, FolderPlus, Upload } from "lucide-react";

type Asset = { id: string; title: string; description: string | null; mimeType: string; sizeBytes: number; folderId: string | null; createdAt: string };
type FolderRow = { id: string; name: string; parentFolderId: string | null };
type DefaultDocument = { id: string; title: string; fileName: string; mimeType: string; fileSizeBytes: number };

export default function ClientPortalAssets() {
  const { clients, client, clientId, setClientId } = usePortalClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState("root");
  const [newFolder, setNewFolder] = useState("");
  const assetsQuery = useQuery<{ items: Asset[] }>({ queryKey: [...queryKeys.portal.clientAssets(clientId), { folderId }], queryFn: async () => {
    const response = await fetch(`/api/client-portal/clients/${clientId}/assets${folderId === "root" ? "" : `?folderId=${folderId}`}`, { credentials: "include" });
    if (!response.ok) throw new Error("Unable to load assets"); return response.json();
  }, enabled: !!clientId });
  const foldersQuery = useQuery<FolderRow[]>({ queryKey: queryKeys.portal.clientAssetFolders(clientId), enabled: !!clientId });
  const defaultsQuery = useQuery<{ documents: DefaultDocument[] }>({ queryKey: queryKeys.portal.clientDefaultAssets(clientId), enabled: !!clientId });
  const createFolder = useMutation({ mutationFn: async () => (await apiRequest("POST", `/api/client-portal/clients/${clientId}/assets/folders`, { name: newFolder, parentFolderId: folderId === "root" ? null : folderId })).json(), onSuccess: () => { setNewFolder(""); queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientAssetFolders(clientId) }); }, onError: (error: Error) => toast({ title: "Unable to create folder", description: error.message, variant: "destructive" }) });
  const renameFolder = useMutation({ mutationFn: async (name: string) => (await apiRequest("PATCH", `/api/client-portal/clients/${clientId}/assets/folders/${folderId}`, { name })).json(), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientAssetFolders(clientId) }), onError: (error: Error) => toast({ title: "Unable to rename folder", description: error.message, variant: "destructive" }) });
  const updateAsset = useMutation({ mutationFn: async ({ assetId, body }: { assetId: string; body: Record<string, unknown> }) => (await apiRequest("PATCH", `/api/client-portal/clients/${clientId}/assets/${assetId}`, body)).json(), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientAssets(clientId) }), onError: (error: Error) => toast({ title: "Unable to update file", description: error.message, variant: "destructive" }) });
  const upload = useMutation({ mutationFn: async (file: File) => {
    const form = new FormData(); form.append("file", file); if (folderId !== "root") form.append("folderId", folderId);
    const response = await fetch(`/api/client-portal/clients/${clientId}/assets/upload`, { method: "POST", body: form, credentials: "include" });
    if (!response.ok) throw new Error((await response.json()).message || "Upload failed"); return response.json();
  }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientAssets(clientId) }); toast({ title: "File uploaded" }); }, onError: (error: Error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }) });
  const download = async (asset: Asset) => { const response = await fetch(`/api/client-portal/clients/${clientId}/assets/${asset.id}/download`, { credentials: "include" }); const data = await response.json(); if (data.url) window.open(data.url, "_blank", "noopener,noreferrer"); };
  const downloadDefault = async (document: DefaultDocument) => { const response = await fetch(`/api/client-portal/clients/${clientId}/assets/defaults/${document.id}/download`, { credentials: "include" }); const data = await response.json(); if (data.url) window.open(data.url, "_blank", "noopener,noreferrer"); };

  if (!client) return <div className="p-6">No active Client account is available.</div>;
  return <div className="p-3 sm:p-6 overflow-y-auto h-full space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h1 className="text-2xl font-bold">Asset Library</h1><p className="text-muted-foreground">Manage client-visible files without deletion.</p></div>{clients.length > 1 && <Select value={clientId} onValueChange={setClientId}><SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.displayName || item.companyName}</SelectItem>)}</SelectContent></Select>}</div>
    <Card><CardContent className="p-4 flex flex-col sm:flex-row gap-3"><Select value={folderId} onValueChange={setFolderId}><SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="root">Root</SelectItem>{foldersQuery.data?.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select>{folderId !== "root" && <Button variant="outline" onClick={() => { const current = foldersQuery.data?.find((folder) => folder.id === folderId); const name = window.prompt("Folder name", current?.name || ""); if (name?.trim()) renameFolder.mutate(name.trim()); }}>Rename folder</Button>}<Input placeholder="New folder name" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} /><Button variant="outline" onClick={() => createFolder.mutate()} disabled={!newFolder.trim()}><FolderPlus className="h-4 w-4 mr-2" />New folder</Button><input ref={inputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} /><Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}><Upload className="h-4 w-4 mr-2" />Upload</Button></CardContent></Card>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{assetsQuery.data?.items.map((asset) => <Card key={asset.id}><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileIcon className="h-4 w-4" />{asset.title}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{asset.mimeType} · {Math.ceil(asset.sizeBytes / 1024)} KB</p>{asset.description && <p className="text-sm mt-2">{asset.description}</p>}<div className="flex flex-wrap gap-2 mt-3"><Button variant="outline" size="sm" onClick={() => download(asset)}><Download className="h-4 w-4 mr-2" />Download</Button><Button variant="outline" size="sm" onClick={() => { const title = window.prompt("File name", asset.title); if (title?.trim()) updateAsset.mutate({ assetId: asset.id, body: { title: title.trim() } }); }}>Rename</Button><Select value={asset.folderId || "root"} onValueChange={(target) => updateAsset.mutate({ assetId: asset.id, body: { folderId: target === "root" ? null : target } })}><SelectTrigger className="h-9 w-36"><SelectValue placeholder="Move" /></SelectTrigger><SelectContent><SelectItem value="root">Root</SelectItem>{foldersQuery.data?.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>)}</div>
    {!assetsQuery.data?.items.length && <div className="py-16 text-center text-muted-foreground"><Folder className="h-12 w-12 mx-auto mb-3 opacity-40" />No client-visible files in this folder.</div>}
    {!!defaultsQuery.data?.documents.length && <section><h2 className="text-lg font-semibold mb-3">Shared by your service team</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{defaultsQuery.data.documents.map((document) => <Card key={document.id}><CardContent className="p-4"><p className="font-medium">{document.title}</p><p className="text-xs text-muted-foreground mt-1">Read-only default document</p><Button variant="outline" size="sm" className="mt-3" onClick={() => downloadDefault(document)}><Download className="h-4 w-4 mr-2" />Download</Button></CardContent></Card>)}</div></section>}
  </div>;
}
