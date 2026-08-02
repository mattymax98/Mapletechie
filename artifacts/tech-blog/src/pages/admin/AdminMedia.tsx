import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Copy, Image as ImageIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ImageUploadField } from "@/components/ImageUploadField";
import { adminFetch, adminJson } from "@/lib/adminFetch";
import { useToast } from "@/hooks/use-toast";

interface MediaItem {
  id: number;
  url: string;
  filename: string;
  mimeType?: string | null;
  size?: number | null;
  uploaderName?: string | null;
  source?: string | null;
  createdAt: string;
}

export default function AdminMedia() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingUrl, setPendingUrl] = useState("");
  const [pendingFilename, setPendingFilename] = useState("");
  const { toast } = useToast();

  async function load() {
    setBusy(true);
    try {
      const list = await adminJson<MediaItem[]>("/admin/media");
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!pendingUrl || !pendingFilename) {
      toast({ title: "Add an image and a filename first.", variant: "destructive" });
      return;
    }
    try {
      await adminJson("/admin/media", {
        method: "POST",
        body: JSON.stringify({ url: pendingUrl, filename: pendingFilename }),
      });
      setPendingUrl("");
      setPendingFilename("");
      toast({ title: "Added to library" });
      await load();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    }
  }

  async function remove(item: MediaItem) {
    if (!confirm(`Remove ${item.filename} from the library? The actual file in storage is not deleted.`)) return;
    await adminFetch(`/admin/media/${item.id}`, { method: "DELETE" });
    await load();
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "URL copied" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }

  return (
    <AdminShell
      title="Media Library"
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={busy} className="border-zinc-700 text-zinc-300 gap-2">
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Refresh
        </Button>
      }
    >
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-red-500" /> Media Library
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            One place for the images you reuse — cover photos, author headshots, screenshots. Upload here once, then pick from the library when you write a post or send an email.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 mb-8">
          <h2 className="text-lg font-bold mb-3">Add new image</h2>
          <div className="space-y-3">
            <ImageUploadField
              value={pendingUrl}
              onChange={(url) => {
                setPendingUrl(url);
                if (!pendingFilename && url) {
                  const guess = url.split("/").pop()?.split("?")[0] || "image";
                  setPendingFilename(guess.slice(0, 80));
                }
              }}
              helpText="Upload from your device or paste any image URL."
            />
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                value={pendingFilename}
                onChange={(e) => setPendingFilename(e.target.value)}
                placeholder="filename.jpg"
                className="sm:col-span-2 bg-zinc-900 border border-zinc-700 text-white rounded px-3 py-2 text-sm font-mono"
              />
              <Button onClick={save} disabled={!pendingUrl || !pendingFilename} className="bg-red-500 hover:bg-red-600 text-white">
                Save to library
              </Button>
            </div>
          </div>
        </div>

        <h2 className="text-lg font-bold mb-3">Library ({items?.length || 0})</h2>
        {!items && <p className="text-zinc-500">Loading…</p>}
        {items && items.length === 0 && (
          <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded">
            Empty for now. The first image you save here will show up alongside the post-form image picker too.
          </div>
        )}
        {items && items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-zinc-950 border border-zinc-800 rounded overflow-hidden group">
                <div className="aspect-video bg-zinc-900 overflow-hidden">
                  {item.url ? (
                    <img src={item.url} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-xs font-mono text-zinc-300 truncate" title={item.filename}>{item.filename}</p>
                  <p className="text-[11px] text-zinc-500">
                    {item.uploaderName || "Unknown"} · {format(new Date(item.createdAt), "MMM d")}
                  </p>
                  {item.source && (
                    <p className="text-[11px] text-zinc-600 truncate" title={item.source}>
                      saved from{" "}
                      <a
                        href={item.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-red-400"
                      >
                        {(() => { try { return new URL(item.source).hostname; } catch { return item.source; } })()}
                      </a>
                    </p>
                  )}
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => copyUrl(item.url)} className="h-7 px-2 text-zinc-400 hover:text-red-400 gap-1 text-xs flex-1">
                      <Copy className="w-3 h-3" /> URL
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(item)} className="h-7 px-2 text-zinc-400 hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {items && items.length > 0 && (
          <div className="mt-6">
            <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">{items.length} image{items.length === 1 ? "" : "s"}</Badge>
          </div>
        )}
      </main>
    </AdminShell>
  );
}
