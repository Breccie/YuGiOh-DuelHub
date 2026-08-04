"use client";

import { IconPhotoPlus, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { MediaAssetDto, MediaAssetKind } from "@ygo/contracts";
import { getApiErrorMessage } from "@/lib/api-client";
import { mediaClient } from "@/lib/media-client";

type Point = { x: number; y: number };

export function ImageCropUpload({
  kind,
  aspect,
  label = "Bild hochladen",
  onUploaded,
}: {
  kind: MediaAssetKind;
  aspect: number;
  label?: string;
  onUploaded: (asset: MediaAssetDto) => void;
}) {
  const [source, setSource] = useState<{ file: File; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offset: Point } | null>(null);

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source.url);
  }, [source]);

  useEffect(() => {
    if (!source) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSource(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [source]);

  function choose(file: File | null) {
    if (!file) return;
    if (source) URL.revokeObjectURL(source.url);
    setSource({ file, url: URL.createObjectURL(file) });
    setName(file.name.replace(/\.[^.]+$/, ""));
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
  }

  async function renderCrop() {
    const image = imageRef.current;
    if (!source || !image) throw new Error("Das Bild ist noch nicht bereit.");
    const outputWidth = kind === "AVATAR" ? 512 : kind === "PACK_ARTWORK" ? 900 : 1024;
    const outputHeight = Math.round(outputWidth / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Der Bildausschnitt konnte nicht erstellt werden.");

    const sourceAspect = image.naturalWidth / image.naturalHeight;
    const baseScale = sourceAspect > aspect
      ? outputHeight / image.naturalHeight
      : outputWidth / image.naturalWidth;
    const scale = baseScale * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const maxX = Math.max(0, (width - outputWidth) / 2);
    const maxY = Math.max(0, (height - outputHeight) / 2);
    const x = (outputWidth - width) / 2 + (offset.x / 100) * maxX;
    const y = (outputHeight - height) / 2 + (offset.y / 100) * maxY;
    context.drawImage(image, x, y, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob) throw new Error("Der Bildausschnitt konnte nicht gespeichert werden.");
    return new File([blob], `${name.trim() || "design"}.webp`, { type: "image/webp" });
  }

  async function upload() {
    setBusy(true);
    setError("");
    try {
      const file = await renderCrop();
      const asset = await mediaClient.upload(file, kind, name.trim() || "Mein Design");
      onUploaded(asset);
      setSource(null);
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Das Bild konnte nicht hochgeladen werden."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="ui-button ui-button-secondary inline-flex cursor-pointer items-center gap-2">
        <IconPhotoPlus size={17} /> {label}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
      </label>
      {source ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Bildausschnitt wählen">
          <div className="w-full max-w-[680px] rounded-2xl border border-white/15 bg-[#0b1016] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-white">Bildausschnitt wählen</h2><p className="text-sm text-white/55">Ziehen verschiebt das Motiv, der Regler ändert den Zoom.</p></div>
              <button className="ui-icon-button" type="button" onClick={() => setSource(null)} aria-label="Schließen"><IconX size={19} /></button>
            </div>
            <div
              className="relative mx-auto max-h-[56vh] w-full overflow-hidden rounded-xl bg-black/50 touch-none"
              style={{ aspectRatio: String(aspect) }}
              role="application"
              aria-label="Bildausschnitt. Mit den Pfeiltasten verschieben."
              tabIndex={0}
              onKeyDown={(event) => {
                const delta = event.shiftKey ? 10 : 3;
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault();
                setOffset((current) => ({
                  x: Math.max(-100, Math.min(100, current.x + (event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0))),
                  y: Math.max(-100, Math.min(100, current.y + (event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0))),
                }));
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                setOffset({
                  x: Math.max(-100, Math.min(100, drag.offset.x + (event.clientX - drag.x) / 2)),
                  y: Math.max(-100, Math.min(100, drag.offset.y + (event.clientY - drag.y) / 2)),
                });
              }}
              onPointerUp={() => { dragRef.current = null; }}
              onPointerCancel={() => { dragRef.current = null; }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imageRef} src={source.url} alt="Vorschau des gewählten Bildes" className="h-full w-full select-none object-cover" style={{ transform: `translate(${offset.x / 4}%, ${offset.y / 4}%) scale(${zoom})` }} draggable={false} />
              {kind === "AVATAR" ? (
                <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#e8c889] shadow-[0_0_0_999px_rgba(2,4,8,0.62),inset_0_0_22px_rgba(0,0,0,0.2)]" aria-hidden="true" />
              ) : (
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#d9b36c]/70" />
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
              <label className="grid gap-1 text-sm text-white/70">Name<input className="ui-input" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
              <label className="grid gap-1 text-sm text-white/70">Zoom<input type="range" min="1" max="2.5" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
            </div>
            {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="ui-button ui-button-secondary" onClick={() => setSource(null)}>Abbrechen</button>
              <button type="button" className="ui-button ui-button-primary" disabled={busy || !name.trim()} onClick={() => void upload()}>{busy ? "Wird hochgeladen …" : "Bild verwenden"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
