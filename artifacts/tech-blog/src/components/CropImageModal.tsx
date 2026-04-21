import { useState, useRef, useEffect } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface CropImageModalProps {
  file: File;
  /** Aspect ratio (width / height). Omit for free crop. e.g. 16/9 for cover, 1 for avatar. */
  aspect?: number;
  onCancel: () => void;
  onComplete: (croppedFile: File) => void;
  /** "Skip" lets the user use the original file uncropped. Defaults true. */
  allowSkip?: boolean;
}

function centerInitialCrop(width: number, height: number, aspect?: number): Crop {
  if (!aspect) {
    return { unit: "%", x: 5, y: 5, width: 90, height: 90 };
  }
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
    width,
    height,
  );
}

async function cropFile(
  imageEl: HTMLImageElement,
  crop: PixelCrop,
  originalFile: File,
): Promise<File> {
  // The displayed image is scaled down — convert pixel crop to natural pixels.
  const scaleX = imageEl.naturalWidth / imageEl.width;
  const scaleY = imageEl.naturalHeight / imageEl.height;

  const cropX = Math.round(crop.x * scaleX);
  const cropY = Math.round(crop.y * scaleY);
  const cropW = Math.round(crop.width * scaleX);
  const cropH = Math.round(crop.height * scaleY);

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return originalFile;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imageEl, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const outType =
    originalFile.type === "image/png"
      ? "image/png"
      : originalFile.type === "image/webp"
        ? "image/webp"
        : "image/jpeg";

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, outType, 0.95),
  );
  if (!blob) return originalFile;

  const baseName = originalFile.name.replace(/\.[^.]+$/, "");
  const ext = outType === "image/png" ? "png" : outType === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${baseName}-cropped.${ext}`, {
    type: outType,
    lastModified: Date.now(),
  });
}

export function CropImageModal({
  file,
  aspect,
  onCancel,
  onComplete,
  allowSkip = true,
}: CropImageModalProps) {
  const [src, setSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerInitialCrop(width, height, aspect));
  };

  const apply = async () => {
    if (!imgRef.current || !pixelCrop || pixelCrop.width === 0 || pixelCrop.height === 0) {
      onComplete(file);
      return;
    }
    setBusy(true);
    try {
      const cropped = await cropFile(imgRef.current, pixelCrop, file);
      onComplete(cropped);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h3 className="font-bold text-white">Crop image</h3>
            <p className="text-xs text-zinc-400">
              {aspect
                ? `Drag the corners to frame the image. Aspect locked to ${aspect.toFixed(2)}:1.`
                : "Drag the corners to frame the image."}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-white p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-zinc-900">
          {src && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setPixelCrop(c)}
              aspect={aspect}
              keepSelection
              className="max-h-[60vh]"
            >
              <img
                ref={imgRef}
                src={src}
                onLoad={onImageLoad}
                alt="To crop"
                className="max-h-[60vh] object-contain"
              />
            </ReactCrop>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800">
          {allowSkip && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onComplete(file)}
              disabled={busy}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Use original
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={apply}
            disabled={busy}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {busy ? "Cropping..." : "Apply crop"}
          </Button>
        </div>
      </div>
    </div>
  );
}
