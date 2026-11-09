"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { uploadToCdn } from "./shared";

/**
 * Recorte cuadrado 900×900 → webp → CDN. Misma lógica que tenía el modal de
 * producto (arrastrar para centrar + zoom), ahora en su propio componente.
 */
export function ImageCropper({
  blobUrl,
  onCancel,
  onUploaded,
}: {
  blobUrl: string;
  onCancel: () => void;
  onUploaded: (url: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  function clamp(ox: number, oy: number, z: number): [number, number] {
    const img = imgRef.current;
    const box = boxRef.current;
    if (!img || !box || !img.naturalWidth) return [ox, oy];
    const C = box.getBoundingClientRect().width;
    const total = Math.max(C / img.naturalWidth, C / img.naturalHeight) * z;
    const mx = Math.max(0, (img.naturalWidth * total - C) / 2);
    const my = Math.max(0, (img.naturalHeight * total - C) / 2);
    return [Math.max(-mx, Math.min(mx, ox)), Math.max(-my, Math.min(my, oy))];
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const [x, y] = clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y, zoom);
    setOffset({ x, y });
  }

  function changeZoom(z: number) {
    const [x, y] = clamp(offset.x, offset.y, z);
    setZoom(z);
    setOffset({ x, y });
  }

  async function confirm() {
    const img = imgRef.current;
    const box = boxRef.current;
    if (!img || !box) return;
    if (!img.complete || img.naturalWidth === 0) await new Promise<void>((r) => (img.onload = () => r()));
    const C = box.getBoundingClientRect().width;
    const total = Math.max(C / img.naturalWidth, C / img.naturalHeight) * zoom;
    const srcX = img.naturalWidth / 2 - (C / 2 + offset.x) / total;
    const srcY = img.naturalHeight / 2 - (C / 2 + offset.y) / total;
    const srcSize = C / total;
    const sx = Math.max(0, Math.min(srcX, img.naturalWidth - srcSize));
    const sy = Math.max(0, Math.min(srcY, img.naturalHeight - srcSize));
    const ss = Math.min(srcSize, img.naturalWidth - sx, img.naturalHeight - sy);
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 900;
    canvas.getContext("2d")!.drawImage(img, sx, sy, ss, ss, 0, 0, 900, 900);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/webp", 0.9));
    setUploading(true);
    try {
      onUploaded(await uploadToCdn(blob, "crop.webp"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error subiendo imagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !uploading && onCancel()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
        </DialogHeader>
        <div
          ref={boxRef}
          className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-muted active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={blobUrl}
            alt="Vista previa del recorte"
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-cover"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: "center" }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.14) 1px, transparent 1px)",
              backgroundSize: "33.33% 33.33%",
            }}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Zoom · arrastra la foto para centrarla</p>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => changeZoom(parseFloat(e.target.value))} className="w-full accent-primary" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={uploading}>
            {uploading ? "Subiendo…" : "Usar foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
