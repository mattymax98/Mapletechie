import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Upload, Link2, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/uploadImage";
import { CropImageModal } from "@/components/CropImageModal";

export type ImagePreviewStatus = "idle" | "checking" | "ok" | "broken";

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** "tall" shows a wide preview area (covers, OG images). "avatar" shows a round preview. */
  variant?: "tall" | "avatar";
  helpText?: string;
  /** Aspect ratio for the cropper (width/height). Defaults: tall=16/9, avatar=1. */
  cropAspect?: number;
  /** Notified whenever the preview load status changes. */
  onStatusChange?: (status: ImagePreviewStatus) => void;
}

export function ImageUploadField({
  value,
  onChange,
  variant = "tall",
  helpText,
  cropAspect,
  onStatusChange,
}: ImageUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);

  const aspect = cropAspect ?? (variant === "avatar" ? 1 : 16 / 9);

  const [previewStatus, setPreviewStatus] = useState<ImagePreviewStatus>("idle");

  useEffect(() => {
    onStatusChange?.(previewStatus);
  }, [previewStatus, onStatusChange]);

  useEffect(() => {
    if (!value) {
      setPreviewStatus("idle");
      return;
    }
    setPreviewStatus("checking");
    let cancelled = false;

    const img = new Image();
    img.onload = () => {
      if (!cancelled) setPreviewStatus("ok");
    };
    img.onerror = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(value, { method: "HEAD" });
        if (cancelled) return;
        const ct = res.headers.get("content-type") ?? "";
        if (res.ok && (ct.startsWith("image/") || ct === "")) {
          setPreviewStatus("ok");
        } else {
          setPreviewStatus("broken");
        }
      } catch {
        if (!cancelled) setPreviewStatus("broken");
      }
    };
    img.src = value;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [value]);

  const doUpload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      onChange(url);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleFile = (file: File) => {
    // Skip cropper for GIFs (animated) — upload as-is.
    if (file.type === "image/gif") {
      doUpload(file);
      return;
    }
    setPendingCrop(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
            mode === "upload"
              ? "bg-red-500/15 border-red-500 text-red-300"
              : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white"
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload from device
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
            mode === "url"
              ? "bg-red-500/15 border-red-500 text-red-300"
              : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white"
          }`}
        >
          <Link2 className="w-4 h-4" />
          Paste URL
        </button>
      </div>

      {mode === "upload" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`w-full cursor-pointer rounded border-2 border-dashed p-6 text-center transition-colors ${
            dragOver
              ? "border-red-500 bg-red-500/10"
              : "border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50"
          } ${uploading ? "opacity-60 cursor-wait" : ""}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onFileChange}
            className="hidden"
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-300">
              <Loader2 className="w-4 h-4 animate-spin" /> Uploading & optimizing...
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload className="w-6 h-6 text-zinc-400" />
              <p className="text-sm text-zinc-300 font-medium">
                {dragOver ? "Drop to upload" : "Click or drag an image here"}
              </p>
              <p className="text-xs text-zinc-500">JPG, PNG, WEBP, or GIF · auto-resized if oversized</p>
            </div>
          )}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="bg-zinc-900 border-zinc-700 text-white focus:border-red-500"
        />
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {value && (
        <div
          className={`mt-2 border rounded overflow-hidden bg-zinc-950 relative ${
            previewStatus === "broken" ? "border-red-500/60" : "border-zinc-800"
          } ${variant === "avatar" ? "w-24 h-24 rounded-full" : ""}`}
        >
          <img
            src={value}
            alt="preview"
            className={
              variant === "avatar"
                ? "w-24 h-24 object-cover"
                : "w-full max-h-48 object-cover"
            }
          />
          <button
            type="button"
            onClick={() => onChange("")}
            title="Remove image"
            className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white rounded p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {value && previewStatus === "broken" && (
        <p className="text-xs text-red-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            This image URL didn&apos;t load. Please verify the link before saving.
          </span>
        </p>
      )}
      {value && previewStatus === "checking" && (
        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking image…
        </p>
      )}

      {helpText && <p className="text-xs text-zinc-500">{helpText}</p>}

      {pendingCrop && (
        <CropImageModal
          file={pendingCrop}
          aspect={aspect}
          onCancel={() => {
            setPendingCrop(null);
            if (fileRef.current) fileRef.current.value = "";
          }}
          onComplete={(cropped) => {
            setPendingCrop(null);
            doUpload(cropped);
          }}
        />
      )}
    </div>
  );
}
