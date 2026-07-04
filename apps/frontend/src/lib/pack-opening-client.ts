import type {
  OpenDisplayRequest,
  OpenDisplayResponse,
  OpenPackRequest,
  OpenPackResponse,
  PackDashboardSnapshotDto,
} from "@ygo/contracts";
import { apiGetJson, apiPostJson } from "@/lib/api-client";

export const packOpeningClient = {
  getDashboard() {
    return apiGetJson<PackDashboardSnapshotDto>("/api/pack-openings", {
      cache: "no-store",
    });
  },

  open(input: OpenPackRequest) {
    return apiPostJson<OpenPackResponse, OpenPackRequest>("/api/pack-openings", input);
  },

  openDisplay(input: OpenDisplayRequest) {
    return apiPostJson<OpenDisplayResponse, OpenDisplayRequest>(
      "/api/pack-openings/displays",
      input,
    );
  },
};
