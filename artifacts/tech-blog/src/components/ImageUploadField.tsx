import { useRef, useState } from "react";
import { Upload, Link2, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/uploadImage";

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** "tall" shows a wide preview area (covers, OG images). "avatar" shows a round preview. */
  variant?: "tall" | "avatar";
  helpText?: string;
}

export function ImageUploadField({
  value,
  onChange,
  variant = "tall",
  helpText,
}: ImageUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
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
              ? "bg-orange-500/15 border-orange-500 text-orange-300"
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
              ? "bg-orange-500/15 border-orange-500 text-orange-300"
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
              ? "border-orange-500 bg-orange-500/10"
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
          className="bg-zinc-900 border-zinc-700 text-white focus:border-orange-500"
        />
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {value && (
        <div
          className={`mt-2 border border-zinc-800 rounded overflow-hidden bg-zinc-950 relative ${
            variant === "avatar" ? "w-24 h-24 rounded-full" : ""
          }`}
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

      {helpText && <p className="text-xs text-zinc-500">{helpText}</p>}
    </div>
  );
}
