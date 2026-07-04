import type {
  CreateCollectionBinderRequest,
  CreateCollectionPresetRequest,
  SaveCollectionBinderPageRequest,
  UpdateCollectionBinderRequest,
  UpdateCollectionPresetRequest,
} from "@ygo/contracts";
import {
  apiGetJson,
  apiPost,
  apiPostJson,
  apiPatchJson,
  apiPutJson,
} from "@/lib/api-client";
import type {
  CollectionBinderDto,
  CollectionBinderEditorSnapshot,
  CollectionBinderPageDto,
  CollectionPresetDto,
} from "@/lib/collection-showcase";

type BinderMutationResponse = {
  binder: CollectionBinderDto;
};

type PresetMutationResponse = {
  preset: CollectionPresetDto;
};

type BinderPageMutationResponse = {
  page: CollectionBinderPageDto;
};

export const collectionClient = {
  createBinder(input: CreateCollectionBinderRequest) {
    return apiPostJson<BinderMutationResponse, CreateCollectionBinderRequest>(
      "/api/collection/binders",
      input,
    );
  },

  updateBinder(binderId: string, input: UpdateCollectionBinderRequest) {
    return apiPatchJson<BinderMutationResponse, UpdateCollectionBinderRequest>(
      `/api/collection/binders/${binderId}`,
      input,
    );
  },

  getBinderEditor(binderId: string) {
    return apiGetJson<CollectionBinderEditorSnapshot>(
      `/api/collection/binders/${binderId}/editor`,
    );
  },

  createBinderPage(binderId: string) {
    return apiPost<BinderPageMutationResponse>(
      `/api/collection/binders/${binderId}/pages`,
    );
  },

  saveBinderPage(
    binderId: string,
    pageId: string,
    input: SaveCollectionBinderPageRequest,
  ) {
    return apiPutJson<BinderPageMutationResponse, SaveCollectionBinderPageRequest>(
      `/api/collection/binders/${binderId}/pages/${pageId}`,
      input,
    );
  },

  createPreset(input: CreateCollectionPresetRequest) {
    return apiPostJson<PresetMutationResponse, CreateCollectionPresetRequest>(
      "/api/collection/presets",
      input,
    );
  },

  updatePreset(presetId: string, input: UpdateCollectionPresetRequest) {
    return apiPatchJson<PresetMutationResponse, UpdateCollectionPresetRequest>(
      `/api/collection/presets/${presetId}`,
      input,
    );
  },
};
