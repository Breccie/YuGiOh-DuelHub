import type { MediaAssetDto, MediaAssetKind } from "@ygo/contracts";
import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "@/lib/api-client";

type UploadIntent = {
  uploadToken: string;
  upload: { mode: "SIGNED" | "LOCAL"; url: string };
};

export const mediaClient = {
  list(kind?: MediaAssetKind) {
    const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return apiGetJson<MediaAssetDto[]>(`/api/media${query}`, { cache: "no-store" });
  },
  async upload(file: File, kind: MediaAssetKind, name: string) {
    const intent = await apiPostJson<UploadIntent, {
      kind: MediaAssetKind;
      name: string;
      contentType: "image/jpeg" | "image/png" | "image/webp";
      byteSize: number;
    }>("/api/media", {
      kind,
      name,
      contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      byteSize: file.size,
    });

    if (intent.upload.mode === "SIGNED") {
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const response = await fetch(intent.upload.url, { method: "PUT", body });
      if (!response.ok) throw new Error("Das Bild konnte nicht in den Onlinespeicher übertragen werden.");
    } else {
      const response = await fetch(intent.upload.url, {
        method: "PUT",
        headers: {
          "content-type": file.type,
          "x-media-upload-token": intent.uploadToken,
        },
        body: file,
      });
      if (!response.ok) throw new Error("Das Bild konnte nicht lokal gespeichert werden.");
    }

    return apiPostJson<MediaAssetDto, { uploadToken: string }>("/api/media/finalize", {
      uploadToken: intent.uploadToken,
    });
  },
  rename(assetId: string, name: string) {
    return apiPatchJson<MediaAssetDto, { name: string }>(`/api/media/${assetId}`, { name });
  },
  remove(assetId: string) {
    return apiDeleteJson<{ deleted: true }>(`/api/media/${assetId}`);
  },
};
