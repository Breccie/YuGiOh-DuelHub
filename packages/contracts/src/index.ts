import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  status: z.number().int(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const viewerSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  duelistId: z.string(),
  displayName: z.string(),
  avatarKey: z.string(),
  avatarAssetId: z.string().nullable().optional(),
  avatarImageUrl: z.string().nullable().optional(),
  favoriteEra: z.string().nullable(),
  isPublic: z.boolean(),
  showcaseBinderId: z.string().nullable(),
  expiresAt: z.string(),
  rememberDevice: z.boolean(),
  deviceLabel: z.string().nullable(),
});

export type ViewerSession = z.infer<typeof viewerSessionSchema>;

export const loginRequestSchema = z.object({
  duelistId: z.string().trim().min(1),
  password: z.string().trim().min(1),
  rememberDevice: z.boolean().optional().default(false),
  deviceLabel: z.string().trim().max(80).nullable().optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const registerRequestSchema = z.object({
  duelistId: z.string().trim().min(1),
  password: z.string().trim().min(10),
  displayName: z.string().trim().min(1),
  favoriteEra: z.string().trim().max(40).nullable().optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const deckBoxKeySchema = z.enum([
  "inferno-vortex",
  "void-eye",
  "storm-eye",
  "golden-dragon",
]);
export type DeckBoxKey = z.infer<typeof deckBoxKeySchema>;

export const createDeckRequestSchema = z.object({
  name: z.string().trim().min(1),
  deckBoxKey: deckBoxKeySchema.optional(),
  deckBoxAssetId: z.string().trim().min(1).nullable().optional(),
  banlistId: z.string().trim().min(1).nullable().optional(),
  snapshotDate: z.string().trim().min(1).nullable().optional(),
});
export type CreateDeckRequest = z.infer<typeof createDeckRequestSchema>;

export const updateDeckRequestSchema = createDeckRequestSchema.extend({
  revision: z.number().int().nonnegative(),
});
export type UpdateDeckRequest = z.infer<typeof updateDeckRequestSchema>;

export const deckSectionSchema = z.enum(["MAIN", "EXTRA", "SIDE"]);
export type DeckSectionValue = z.infer<typeof deckSectionSchema>;

export const removeDeckCardRequestSchema = z.object({
  cardId: z.string().trim().min(1),
  section: deckSectionSchema,
});
export type RemoveDeckCardRequest = z.infer<typeof removeDeckCardRequestSchema>;

export const upsertDeckCardRequestSchema = removeDeckCardRequestSchema.extend({
  quantity: z.number().int().min(1).max(3),
});
export type UpsertDeckCardRequest = z.infer<typeof upsertDeckCardRequestSchema>;

export const moveDeckCardRequestSchema = z.object({
  cardId: z.string().trim().min(1),
  fromSection: deckSectionSchema,
  toSection: deckSectionSchema,
  quantity: z.number().int().min(1).max(3).optional().default(1),
});
export type MoveDeckCardRequest = z.infer<typeof moveDeckCardRequestSchema>;

export const deckSortModeSchema = z.enum([
  "TYPE_LEVEL",
  "NAME_ASC",
  "NAME_DESC",
  "ATK_DESC",
]);
export type DeckSortMode = z.infer<typeof deckSortModeSchema>;

export const deckExportRequestSchema = z.object({
  exportPath: z.string().trim().min(1).nullable().optional(),
  fileName: z.string().trim().min(1).nullable().optional(),
  linkedDuelRequestId: z.string().trim().min(1).nullable().optional(),
  linkedTournamentMatchId: z.string().trim().min(1).nullable().optional(),
});
export type DeckExportRequest = z.infer<typeof deckExportRequestSchema>;

export const cardOwnershipFilterSchema = z.enum(["ALL", "OWNED", "UNOWNED"]);
export type CardOwnershipFilter = z.infer<typeof cardOwnershipFilterSchema>;

export const cardBanlistStatusSchema = z.enum([
  "ALL",
  "LEGAL",
  "FORBIDDEN",
  "LIMITED",
  "SEMI_LIMITED",
]);
export type CardBanlistStatus = z.infer<typeof cardBanlistStatusSchema>;

export const cardCatalogSortSchema = z.enum([
  "NAME_ASC",
  "NAME_DESC",
  "OWNED_DESC",
  "LEVEL_ASC",
  "LEVEL_DESC",
  "ATK_ASC",
  "ATK_DESC",
  "DEF_ASC",
  "DEF_DESC",
  "TYPE_ASC",
  "ATTRIBUTE_ASC",
  "NEWEST_SET",
]);
export type CardCatalogSort = z.infer<typeof cardCatalogSortSchema>;

export const cardCatalogQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  ownership: cardOwnershipFilterSchema.default("ALL"),
  kind: z.enum(["MONSTER", "SPELL", "TRAP", "TOKEN"]).optional(),
  monsterType: z.string().trim().max(80).optional(),
  attribute: z.string().trim().max(40).optional(),
  levelRankLink: z.coerce.number().int().min(0).max(13).optional(),
  levelRankLinkMin: z.coerce.number().int().min(0).max(13).optional(),
  levelRankLinkMax: z.coerce.number().int().min(0).max(13).optional(),
  atkMin: z.coerce.number().int().min(-1).max(99999).optional(),
  atkMax: z.coerce.number().int().min(-1).max(99999).optional(),
  defMin: z.coerce.number().int().min(-1).max(99999).optional(),
  defMax: z.coerce.number().int().min(-1).max(99999).optional(),
  rarity: z.string().trim().max(60).optional(),
  setCode: z.string().trim().max(40).optional(),
  banlistId: z.string().trim().min(1).optional(),
  banlistStatus: cardBanlistStatusSchema.default("ALL"),
  hasPoints: z.enum(["true", "false"]).optional(),
  sort: cardCatalogSortSchema.default("NAME_ASC"),
  cursor: z.string().trim().min(1).optional(),
  includeFacets: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(12).max(100).default(48),
});
export type CardCatalogQuery = z.infer<typeof cardCatalogQuerySchema>;

export const cardCatalogItemSchema = z.object({
  cardId: z.string(),
  name: z.string(),
  slug: z.string(),
  imageUrl: z.string().nullable(),
  kind: z.enum(["MONSTER", "SPELL", "TRAP", "TOKEN"]),
  attribute: z.string().nullable(),
  monsterType: z.string().nullable(),
  levelRankLink: z.number().int().nullable(),
  atk: z.number().int().nullable(),
  def: z.number().int().nullable(),
  oracleText: z.string().nullable(),
  totalCopies: z.number().int(),
  availableCopies: z.number().int(),
  reservedCopies: z.number().int(),
  tradedCopies: z.number().int(),
  deckCopies: z.number().int(),
  mainCopies: z.number().int(),
  extraCopies: z.number().int(),
  sideCopies: z.number().int(),
  owned: z.boolean(),
  rarities: z.array(z.string()),
  setCodes: z.array(z.string()),
  legalLimit: z.number().int().min(0).max(3),
  pointValue: z.number().int(),
  errataCutoff: z.string().nullable(),
});
export type CardCatalogItem = z.infer<typeof cardCatalogItemSchema>;

export const cardCatalogResponseSchema = z.object({
  items: z.array(cardCatalogItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  ownership: z.object({
    uniqueOwned: z.number().int(),
    totalCards: z.number().int(),
  }),
  facets: z.object({
    monsterTypes: z.array(z.string()),
    attributes: z.array(z.string()),
    levels: z.array(z.number().int()),
    rarities: z.array(z.string()),
    setCodes: z.array(z.string()),
  }).optional(),
});
export type CardCatalogResponse = z.infer<typeof cardCatalogResponseSchema>;

export const wishlistPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);
export type WishlistPriority = z.infer<typeof wishlistPrioritySchema>;

export const upsertWishlistItemRequestSchema = z.object({
  cardId: z.string().trim().min(1),
  desiredQuantity: z.number().int().min(1).max(99).default(1),
  priority: wishlistPrioritySchema.default("NORMAL"),
  note: z.string().trim().max(240).nullable().optional(),
});
export type UpsertWishlistItemRequest = z.infer<
  typeof upsertWishlistItemRequestSchema
>;

export const wishlistItemSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  desiredQuantity: z.number().int(),
  ownedQuantity: z.number().int(),
  missingQuantity: z.number().int(),
  priority: wishlistPrioritySchema,
  note: z.string().nullable(),
  completed: z.boolean(),
  updatedAt: z.string(),
});
export type WishlistItem = z.infer<typeof wishlistItemSchema>;

export const createDuelRequestSchema = z.object({
  opponentDuelistId: z.string().trim().min(1),
  message: z.string().trim().max(400).nullable().optional(),
  requesterDeckId: z.string().trim().min(1).nullable().optional(),
  proposedAt: z.string().trim().min(1).nullable().optional(),
  confirmedAt: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
  tournamentMatchId: z.string().trim().min(1).nullable().optional(),
});
export type CreateDuelRequest = z.infer<typeof createDuelRequestSchema>;

export const duelActionRequestSchema = z.object({
  action: z.enum(["accept", "decline", "cancel", "schedule"]),
  proposedAt: z.string().trim().min(1).nullable().optional(),
  confirmedAt: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
  platform: z.string().trim().max(40).nullable().optional(),
});
export type DuelActionRequest = z.infer<typeof duelActionRequestSchema>;

export const createTradeRequestSchema = z.object({
  responderDuelistId: z.string().trim().min(1),
  note: z.string().trim().max(400).nullable().optional(),
  offeredEntryIds: z.array(z.string().trim().min(1)).default([]),
  requestedEntryIds: z.array(z.string().trim().min(1)).default([]),
  offeredCredits: z.number().int().min(0).max(999_999).default(0),
  requestedCredits: z.number().int().min(0).max(999_999).default(0),
});
export type CreateTradeRequest = z.infer<typeof createTradeRequestSchema>;

export const createTradeVersionRequestSchema = z.object({
  note: z.string().trim().max(400).nullable().optional(),
  offeredEntryIds: z.array(z.string().trim().min(1)).default([]),
  requestedEntryIds: z.array(z.string().trim().min(1)).default([]),
  offeredCredits: z.number().int().min(0).max(999_999).default(0),
  requestedCredits: z.number().int().min(0).max(999_999).default(0),
});
export type CreateTradeVersionRequest = z.infer<typeof createTradeVersionRequestSchema>;

export const tradeDecisionRequestSchema = z.object({
  action: z.enum(["accept", "reject", "cancel", "confirmCompletion", "approve"]),
});
export type TradeDecisionRequest = z.infer<typeof tradeDecisionRequestSchema>;

export const createFriendRequestSchema = z.object({
  duelistId: z.string().trim().min(1),
});
export type CreateFriendRequest = z.infer<typeof createFriendRequestSchema>;

export const friendRequestDecisionSchema = z.object({
  action: z.enum(["accept", "decline", "block"]),
});
export type FriendRequestDecisionRequest = z.infer<
  typeof friendRequestDecisionSchema
>;

export const collectionCardKindSchema = z.enum([
  "MONSTER",
  "SPELL",
  "TRAP",
  "TOKEN",
]);
export type CollectionCardKindValue = z.infer<typeof collectionCardKindSchema>;

export const collectionLayoutModeSchema = z.enum(["BINDER", "GRID"]);
export type CollectionLayoutModeValue = z.infer<
  typeof collectionLayoutModeSchema
>;

export const collectionSortModeSchema = z.enum([
  "MOST_COPIES",
  "NEWEST_ACQUIRED",
  "ALPHABETICAL",
  "RARITY",
]);
export type CollectionSortModeValue = z.infer<typeof collectionSortModeSchema>;

export const createCollectionBinderRequestSchema = z.object({
  name: z.string().trim().min(1),
  coverKey: z.string().trim().min(1),
  coverAssetId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().max(240).nullable().optional(),
});
export type CreateCollectionBinderRequest = z.infer<
  typeof createCollectionBinderRequestSchema
>;

export const updateCollectionBinderRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  coverKey: z.string().trim().min(1).optional(),
  coverAssetId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().max(240).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCollectionBinderRequest = z.infer<
  typeof updateCollectionBinderRequestSchema
>;

export const createCollectionPresetRequestSchema = z.object({
  name: z.string().trim().min(1),
  binderId: z.string().trim().min(1).nullable().optional(),
  searchQuery: z.string().optional(),
  kind: collectionCardKindSchema.nullable().optional(),
  duplicatesOnly: z.boolean().optional(),
  layoutMode: collectionLayoutModeSchema.optional(),
  sortMode: collectionSortModeSchema.optional(),
});
export type CreateCollectionPresetRequest = z.infer<
  typeof createCollectionPresetRequestSchema
>;

export const updateCollectionPresetRequestSchema =
  createCollectionPresetRequestSchema.partial().extend({
    isActive: z.boolean().optional(),
  });
export type UpdateCollectionPresetRequest = z.infer<
  typeof updateCollectionPresetRequestSchema
>;

export const saveCollectionBinderPageSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(17),
  collectionEntryId: z.string().trim().min(1).nullable(),
  entryReferenceId: z.string().trim().min(1).nullable().optional(),
  cardId: z.string().trim().min(1).nullable().optional(),
  cardName: z.string().trim().min(1).nullable().optional(),
  imageUrl: z.string().trim().min(1).nullable().optional(),
  printingLabel: z.string().trim().min(1).nullable().optional(),
  setCode: z.string().trim().min(1).nullable().optional(),
  rarity: z.string().trim().min(1).nullable().optional(),
});
export type SaveCollectionBinderPageSlotRequest = z.infer<
  typeof saveCollectionBinderPageSlotSchema
>;

export const saveCollectionBinderPageRequestSchema = z.object({
  slots: z.array(saveCollectionBinderPageSlotSchema),
});
export type SaveCollectionBinderPageRequest = z.infer<
  typeof saveCollectionBinderPageRequestSchema
>;

export const updateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().trim().max(320).nullable().optional(),
  favoriteEra: z.string().trim().max(40).nullable().optional(),
  avatarKey: z.string().trim().max(80).optional(),
  avatarAssetId: z.string().trim().min(1).nullable().optional(),
  isPublic: z.boolean().optional(),
  showcaseBinderId: z.string().trim().min(1).nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const createTournamentRequestSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().max(400).nullable().optional(),
  formatLabel: z.string().trim().max(80).nullable().optional(),
  scheduledAt: z.string().trim().min(1).nullable().optional(),
  pairingMode: z.enum(["SWISS", "ROUND_ROBIN", "SINGLE_ELIMINATION", "MANUAL"]).optional().default("SWISS"),
  matchMode: z.enum(["BEST_OF_ONE", "BEST_OF_THREE", "BEST_OF_FIVE"]).optional().default("BEST_OF_THREE"),
});
export type CreateTournamentRequest = z.infer<typeof createTournamentRequestSchema>;

export const inviteTournamentParticipantRequestSchema = z.object({
  duelistId: z.string().trim().min(1),
});
export type InviteTournamentParticipantRequest = z.infer<
  typeof inviteTournamentParticipantRequestSchema
>;

export const registerTournamentDeckRequestSchema = z.object({
  deckId: z.string().trim().min(1),
});
export type RegisterTournamentDeckRequest = z.infer<typeof registerTournamentDeckRequestSchema>;

export const createManualTournamentRoundRequestSchema = z.object({
  pairs: z.array(z.object({
    playerOneId: z.string().trim().min(1),
    playerTwoId: z.string().trim().min(1).nullable(),
  })).min(1),
});
export type CreateManualTournamentRoundRequest = z.infer<typeof createManualTournamentRoundRequestSchema>;

export const recordTournamentMatchResultRequestSchema = z.object({
  action: z.enum(["report", "confirm", "adminConfirm"]).optional().default("report"),
  playerOneScore: z.number().int().min(0).optional(),
  playerTwoScore: z.number().int().min(0).optional(),
  winnerId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional(),
});
export type RecordTournamentMatchResultRequest = z.infer<
  typeof recordTournamentMatchResultRequestSchema
>;

export const openPackRequestSchema = z.object({
  setId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).max(120).nullable().optional(),
});
export type OpenPackRequest = z.infer<typeof openPackRequestSchema>;

export type PublicProfile = {
  userId: string;
  duelistId: string;
  displayName: string;
  avatarKey: string;
  avatarAssetId: string | null;
  avatarImageUrl: string | null;
  bio: string | null;
  favoriteEra: string | null;
  isPublic: boolean;
  showcaseBinderId: string | null;
  counts: {
    friends: number;
    decks: number;
    uniqueCards: number;
    copies: number;
  };
  showcase: {
    binderName: string | null;
    coverKey: string | null;
    coverName: string | null;
    coverImageUrl: string | null;
    coverAssetId: string | null;
    accentColor: string | null;
    publishedAt: string | null;
    highlightedCards: Array<{
      collectionEntryId: string | null;
      cardName: string | null;
      imageUrl: string | null;
      rarity: string | null;
      setCode: string | null;
    }>;
  };
  decks: Array<{
    id: string;
    name: string;
    deckBoxKey: DeckBoxKey;
    deckBoxImageUrl: string;
    deckBoxAssetId: string | null;
    updatedAt: string;
    cardCount: number;
    mainCount: number;
    extraCount: number;
    sideCount: number;
    formatName: string | null;
    banlistName: string | null;
  }>;
};

export type FriendRequestDto = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: string;
  updatedAt: string;
  requester: {
    userId: string;
    duelistId: string;
    displayName: string;
    avatarAssetId?: string | null;
    avatarImageUrl?: string | null;
    lastSeenAt: string | null;
    isOnline: boolean;
  };
  addressee: {
    userId: string;
    duelistId: string;
    displayName: string;
    avatarAssetId?: string | null;
    avatarImageUrl?: string | null;
    lastSeenAt: string | null;
    isOnline: boolean;
  };
};

export const publicProfileSchema = z.object({
  userId: z.string(),
  duelistId: z.string(),
  displayName: z.string(),
  avatarKey: z.string(),
  avatarAssetId: z.string().nullable(),
  avatarImageUrl: z.string().nullable(),
  bio: z.string().nullable(),
  favoriteEra: z.string().nullable(),
  isPublic: z.boolean(),
  showcaseBinderId: z.string().nullable(),
  counts: z.object({
    friends: z.number().int(),
    decks: z.number().int(),
    uniqueCards: z.number().int(),
    copies: z.number().int(),
  }),
  showcase: z.object({
    binderName: z.string().nullable(),
    coverKey: z.string().nullable(),
    coverName: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
    coverAssetId: z.string().nullable(),
    accentColor: z.string().nullable(),
    publishedAt: z.string().nullable(),
    highlightedCards: z.array(
      z.object({
        collectionEntryId: z.string().nullable(),
        cardName: z.string().nullable(),
        imageUrl: z.string().nullable(),
        rarity: z.string().nullable(),
        setCode: z.string().nullable(),
      }),
    ),
  }),
  decks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      deckBoxKey: deckBoxKeySchema,
      deckBoxImageUrl: z.string(),
      deckBoxAssetId: z.string().nullable(),
      updatedAt: z.string(),
      cardCount: z.number().int(),
      mainCount: z.number().int(),
      extraCount: z.number().int(),
      sideCount: z.number().int(),
      formatName: z.string().nullable(),
      banlistName: z.string().nullable(),
    }),
  ),
});

export const publicProfileResponseSchema = z.object({
  profile: publicProfileSchema,
});
export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;

export const updatedProfileSchema = z.object({
  id: z.string(),
  duelistId: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  favoriteEra: z.string().nullable(),
  avatarKey: z.string(),
  avatarAssetId: z.string().nullable(),
  avatarImageUrl: z.string().nullable(),
  isPublic: z.boolean(),
  showcaseBinderId: z.string().nullable(),
});

export const updateProfileResponseSchema = z.object({
  profile: updatedProfileSchema,
});
export type UpdateProfileResponse = z.infer<typeof updateProfileResponseSchema>;

export const friendRequestDtoSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "ACCEPTED", "BLOCKED"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  requester: z.object({
    userId: z.string(),
    duelistId: z.string(),
    displayName: z.string(),
    avatarAssetId: z.string().nullable().optional(),
    avatarImageUrl: z.string().nullable().optional(),
    lastSeenAt: z.string().nullable(),
    isOnline: z.boolean(),
  }),
  addressee: z.object({
    userId: z.string(),
    duelistId: z.string(),
    displayName: z.string(),
    avatarAssetId: z.string().nullable().optional(),
    avatarImageUrl: z.string().nullable().optional(),
    lastSeenAt: z.string().nullable(),
    isOnline: z.boolean(),
  }),
});

export const friendRequestsResponseSchema = z.object({
  requests: z.array(friendRequestDtoSchema),
});
export type FriendRequestsResponse = z.infer<typeof friendRequestsResponseSchema>;

export const friendRequestMutationResponseSchema = z.object({
  request: friendRequestDtoSchema.nullable(),
});
export type FriendRequestMutationResponse = z.infer<
  typeof friendRequestMutationResponseSchema
>;

export type TradeOfferDraft = {
  responderDuelistId: string;
  note: string | null;
  offeredEntryIds: string[];
  requestedEntryIds: string[];
  offeredCredits?: number;
  requestedCredits?: number;
};

export type TradeVersionDraft = {
  note: string | null;
  offeredEntryIds: string[];
  requestedEntryIds: string[];
  offeredCredits?: number;
  requestedCredits?: number;
};

export type TradeParticipantDto = {
  userId: string;
  duelistId: string;
  displayName: string;
};

export type TradeCardLineDto = {
  tradeVersionItemId: string;
  collectionEntryId: string;
  fromUserId: string;
  toUserId: string;
  cardName: string;
  rarity: string | null;
  setCode: string | null;
};

export type TradeVersionDto = {
  id: string;
  versionNumber: number;
  note: string | null;
  createdAt: string;
  supersededAt: string | null;
  sender: TradeParticipantDto;
  recipient: TradeParticipantDto;
  offered: TradeCardLineDto[];
  requested: TradeCardLineDto[];
  offeredCredits: number;
  requestedCredits: number;
  isActive: boolean;
  isAccepted: boolean;
};

export type TradeTimelineEntryDto = {
  id: string;
  type:
    | "VERSION_CREATED"
    | "TRADE_ACCEPTED"
    | "TRADE_CONFIRMED"
    | "TRADE_APPROVED"
    | "TRADE_COMPLETED"
    | "TRADE_REJECTED"
    | "TRADE_CANCELLED";
  createdAt: string;
  actor: TradeParticipantDto | null;
  title: string;
  detail: string;
};

export type TradeAllowedAction =
  | "accept"
  | "reject"
  | "cancel"
  | "counter"
  | "confirmCompletion"
  | "approve";

export type TradeThreadState =
  | "awaitingYourResponse"
  | "waitingForTheirResponse"
  | "waitingForYourConfirmation"
  | "waitingForTheirConfirmation"
  | "waitingForOrganizerApproval"
  | "completed"
  | "cancelled"
  | "rejected";

export type TradeListItemDto = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED";
  threadState: TradeThreadState;
  proposedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  activeVersionNumber: number | null;
  note: string | null;
  partner: TradeParticipantDto;
  givingCount: number;
  receivingCount: number;
  givingCredits: number;
  receivingCredits: number;
  givingPreview: string[];
  receivingPreview: string[];
  awaitingYourResponse: boolean;
  waitingForYourConfirmation: boolean;
};

export type TradeDetailDto = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED";
  proposedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  acceptedAt: string | null;
  reservationExpiresAt: string | null;
  acceptedVersionId: string | null;
  proposerConfirmedAt: string | null;
  responderConfirmedAt: string | null;
  cancelledByUserId: string | null;
  rejectedByUserId: string | null;
  requiresOrganizerApproval: boolean;
  approvedByUserId: string | null;
  approvedAt: string | null;
  proposer: TradeParticipantDto;
  responder: TradeParticipantDto;
  activeVersion: TradeVersionDto | null;
  versions: TradeVersionDto[];
  viewerRole: "PROPOSER" | "RESPONDER";
  allowedActions: TradeAllowedAction[];
  timeline: TradeTimelineEntryDto[];
};

export type DuelRequestDto = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "SCHEDULED" | "COMPLETED";
  message: string | null;
  createdAt: string;
  requester: {
    userId: string;
    duelistId: string;
    displayName: string;
  };
  opponent: {
    userId: string;
    duelistId: string;
    displayName: string;
  };
  deck: {
    id: string;
    name: string;
  } | null;
  appointment: {
    id: string;
    proposedAt: string | null;
    confirmedAt: string | null;
    platform: string;
    note: string | null;
  } | null;
  exportReference: {
    id: string;
    fileName: string;
    exportPath: string | null;
  } | null;
  tournamentMatchId: string | null;
};

export type TournamentOverviewDto = {
  id: string;
  title: string;
  description: string | null;
  formatLabel: string | null;
  scheduledAt: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  pairingMode: "SWISS" | "ROUND_ROBIN" | "SINGLE_ELIMINATION" | "MANUAL";
  matchMode: "BEST_OF_ONE" | "BEST_OF_THREE" | "BEST_OF_FIVE";
  startedAt: string | null;
  host: {
    userId: string;
    duelistId: string;
    displayName: string;
  };
  participantCount: number;
  acceptedParticipantCount: number;
  roundCount: number;
  latestRound: number | null;
};

export type TournamentStandingsDto = {
  tournamentId: string;
  standings: Array<{
    rank: number;
    userId: string;
    duelistId: string;
    displayName: string;
    matchPoints: number;
    wins: number;
    losses: number;
    draws: number;
    byes: number;
    opponentsMatchWinRate: number;
  }>;
};

export type TournamentMvpCardDto = {
  id: string;
  cardId: string;
  cardName: string;
  imageUrl: string | null;
  featuredUserId: string;
  featuredDisplayName: string;
  position: number;
  note: string | null;
};

export type CampaignLeaderboardRowDto = {
  rank: number;
  userId: string;
  duelistId: string;
  displayName: string;
  tournamentWins: number;
  runnerUpFinishes: number;
  podiumFinishes: number;
  participations: number;
  matchPoints: number;
  matchWins: number;
  losses: number;
  draws: number;
  byes: number;
  winRate: number;
  latestTitleAt: string | null;
};

export type TournamentWinnerArchiveDto = {
  tournamentId: string;
  title: string;
  formatLabel: string | null;
  completedAt: string;
  participantCount: number;
  podium: Array<{
    rank: number;
    userId: string;
    duelistId: string;
    displayName: string;
  }>;
  mvpCards: TournamentMvpCardDto[];
  mvpCandidates: Array<{
    cardId: string;
    cardName: string;
    imageUrl: string | null;
    featuredUserId: string;
    featuredDisplayName: string;
  }>;
  rewardSummary: {
    totalCredits: number;
    totalPacks: number;
    packSetNames: string[];
    grantCount: number;
  };
};

export type CampaignLeaderboardResponse = {
  runId: string;
  viewerRole: "OWNER" | "ORGANIZER" | "PLAYER";
  rows: CampaignLeaderboardRowDto[];
  winnerArchive: TournamentWinnerArchiveDto[];
};

export const updateTournamentMvpCardsRequestSchema = z.object({
  cards: z.array(z.object({
    cardId: z.string().trim().min(1),
    featuredUserId: z.string().trim().min(1),
    note: z.string().trim().max(240).nullable().optional(),
  })).max(3),
});
export type UpdateTournamentMvpCardsRequest = z.infer<
  typeof updateTournamentMvpCardsRequestSchema
>;

export type DeckExportResult = {
  exportId: string;
  deckId: string;
  fileName: string;
  exportPath: string | null;
  exportBody: string;
  linkedDuelRequestId: string | null;
  linkedTournamentMatchId: string | null;
};

export const ruleTopicSchema = z.object({
  slug: z.string(),
  title: z.string(),
  kicker: z.string(),
  summary: z.string(),
  body: z.array(z.string()),
  checklist: z.array(z.string()),
});
export type RuleTopicDto = z.infer<typeof ruleTopicSchema>;

export const ruleFaqItemSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
});
export type RuleFaqItemDto = z.infer<typeof ruleFaqItemSchema>;

export const rulesOverviewResponseSchema = z.object({
  topics: z.array(ruleTopicSchema),
  faq: z.array(ruleFaqItemSchema),
});
export type RulesOverviewResponse = z.infer<typeof rulesOverviewResponseSchema>;

export const ruleTopicResponseSchema = z.object({
  topic: ruleTopicSchema,
});
export type RuleTopicResponse = z.infer<typeof ruleTopicResponseSchema>;

export const homeDashboardResponseSchema = z.object({
  viewer: z.object({
    displayName: z.string(),
  }),
  collectionValue: z.string(),
  activeRunName: z.string(),
  latestBanlistName: z.string(),
  activeEra: z.string(),
  topbar: z
    .object({
      friendOnlineCount: z.number().int().nonnegative(),
      friendCount: z.number().int().nonnegative(),
      duelRequestCount: z.number().int().nonnegative(),
    })
    .optional(),
  heroStats: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ),
  newsItems: z.array(
    z.object({
      id: z.string(),
      kicker: z.string(),
      title: z.string(),
      detail: z.string(),
      meta: z.string(),
    }),
  ),
  duelRequests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rank: z.string(),
      eta: z.string(),
    }),
  ),
  tradeRequests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      detail: z.string(),
      eta: z.string(),
    }),
  ),
  progressCards: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string(),
      detail: z.string(),
      action: z.string(),
    }),
  ),
});
export type HomeDashboardResponse = z.infer<typeof homeDashboardResponseSchema>;

export const dashboardSummaryResponseSchema = homeDashboardResponseSchema;
export type DashboardSummaryResponse = z.infer<typeof dashboardSummaryResponseSchema>;

export const packOpeningSummarySchema = z.object({
  id: z.string(),
  openedAt: z.string(),
  addedToCollection: z.number().int(),
  set: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    packSize: z.number().int(),
  }),
  pulls: z.array(
    z.object({
      id: z.string(),
      slotIndex: z.number().int(),
      cardName: z.string(),
      cardImageUrl: z.string().nullable(),
      rarity: z.string().nullable(),
      setCode: z.string(),
    }),
  ),
});
export type PackOpeningSummaryDto = z.infer<typeof packOpeningSummarySchema>;

export const packDashboardSnapshotSchema = z.object({
  viewer: z.object({
    id: z.string(),
    displayName: z.string(),
  }),
  wallet: z
    .object({
      balance: z.number().int(),
    })
    .nullable(),
  selectedSetId: z.string().nullable(),
  sets: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      releaseDate: z.string(),
      productType: z.string(),
      packSize: z.number().int(),
      cardPoolSize: z.number().int(),
      imageUrl: z.string().nullable(),
      totalOpened: z.number().int(),
      lastOpenedAt: z.string().nullable(),
      isUnlocked: z.boolean(),
      rewardOnly: z.boolean(),
      packPrice: z.number().int().nullable(),
      displaySize: z.number().int().nullable(),
      displayCost: z.number().int().nullable(),
      canBuy: z.boolean(),
    }),
  ),
  recentOpenings: z.array(packOpeningSummarySchema),
});
export type PackDashboardSnapshotDto = z.infer<typeof packDashboardSnapshotSchema>;

export const packSelectionResponseSchema = z.object({
  viewer: z.object({
    displayName: z.string(),
  }),
  wallet: packDashboardSnapshotSchema.shape.wallet,
  activeRunId: z.string().nullable(),
  collectionProgress: z.object({
    owned: z.number().int(),
    total: z.number().int(),
  }),
  latestBanlistName: z.string(),
  selectedSetId: z.string().nullable(),
  sets: packDashboardSnapshotSchema.shape.sets,
  recentCollectionCards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      imageUrl: z.string().nullable(),
      rarity: z.string().nullable(),
      setCode: z.string().nullable(),
    }),
  ),
  activeDeck: z
    .object({
      id: z.string(),
      name: z.string(),
      isLegal: z.boolean(),
      banlistName: z.string(),
      mainCount: z.number().int(),
      extraCount: z.number().int(),
      sideCount: z.number().int(),
      cards: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          imageUrl: z.string().nullable(),
          quantity: z.number().int(),
          issues: z.array(z.string()),
        }),
      ),
    })
    .nullable(),
});
export type PackSelectionResponse = z.infer<typeof packSelectionResponseSchema>;

export const packDetailResponseSchema = z.object({
  viewer: z.object({
    displayName: z.string(),
    duelistId: z.string(),
  }),
  snapshot: packDashboardSnapshotSchema,
  setId: z.string(),
  metrics: z.object({
    collection: z.string(),
    latestBanlistName: z.string(),
    activeEra: z.string(),
  }),
});
export type PackDetailResponse = z.infer<typeof packDetailResponseSchema>;

export const openPackResponseSchema = z.object({
  opening: packOpeningSummarySchema,
});
export type OpenPackResponse = z.infer<typeof openPackResponseSchema>;

export const runStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const runRoleSchema = z.enum(["OWNER", "ORGANIZER", "PLAYER"]);
export const campaignRegionSchema = z.enum(["TCG", "OCG", "GLOBAL", "CUSTOM"]);
export const campaignVisibilitySchema = z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]);
export const campaignJoinTypeSchema = z.enum(["INVITE_CODE", "APPROVAL", "OPEN"]);
export const runJoinRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);
export const creditLedgerSourceSchema = z.enum([
  "STARTING_BALANCE",
  "PACK_PURCHASE",
  "DISPLAY_PURCHASE",
  "DUEL_REWARD",
  "TOURNAMENT_REWARD",
  "ORGANIZER_ADJUSTMENT",
  "MANUAL_GRANT",
  "TRADE_TRANSFER",
]);
export const historyEventTypeSchema = z.enum([
  "WORLD_CHAMPIONSHIP",
  "NATIONALS",
  "TOURNAMENT_PACK_PERIOD",
  "SET_RELEASE",
  "CUSTOM",
]);
export const rewardGrantStatusSchema = z.enum([
  "PENDING",
  "CLAIMED",
  "CANCELLED",
]);
export const runProgressionStatusSchema = z.enum([
  "LOCKED",
  "READY",
  "APPLIED",
]);
export const runProgressionUnlockTypeSchema = z.enum([
  "SET",
  "PROMO_SOURCE",
  "HISTORY_EVENT",
  "REWARD",
]);
export const promoSourceTypeSchema = z.enum([
  "PACK_REWARD",
  "PROMO_CHOICE",
  "FIXED_PROMO_GRANT",
  "PRIZE_PROMO",
]);
export const promoClaimModeSchema = z.enum([
  "CHOOSE",
  "RANDOM",
  "FIXED",
  "ORGANIZER_ONLY",
]);

export const playGroupRunSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  inviteCode: z.string().nullable(),
  description: z.string().nullable(),
  campaignImageAssetId: z.string().nullable(),
  campaignImageUrl: z.string().nullable(),
  region: campaignRegionSchema,
  language: z.string(),
  timeZone: z.string(),
  visibility: campaignVisibilitySchema,
  joinType: campaignJoinTypeSchema,
  maxPlayers: z.number().int().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  status: runStatusSchema,
  historyCursor: z.string().nullable(),
  defaultPackPrice: z.number().int(),
  defaultDisplaySize: z.number().int(),
  freePacksPerSetUnlock: z.number().int(),
  initialSetUnlockCount: z.number().int(),
  setsPerProgressionStep: z.number().int(),
  separatePromoProgression: z.boolean(),
  tournamentWinnerCredits: z.number().int(),
  tournamentRunnerUpCredits: z.number().int(),
  tournamentParticipationCredits: z.number().int(),
  startingCredits: z.number().int(),
  viewerRole: runRoleSchema,
  memberCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlayGroupRunDto = z.infer<typeof playGroupRunSchema>;

export const runMembershipSchema = z.object({
  id: z.string(),
  runId: z.string(),
  userId: z.string(),
  role: runRoleSchema,
  joinedAt: z.string(),
});
export type RunMembershipDto = z.infer<typeof runMembershipSchema>;

export const runMemberSchema = runMembershipSchema.extend({
  duelistId: z.string(),
  displayName: z.string(),
});
export type RunMemberDto = z.infer<typeof runMemberSchema>;

export const runJoinRequestSchema = z.object({
  id: z.string(),
  runId: z.string(),
  userId: z.string(),
  duelistId: z.string(),
  displayName: z.string(),
  status: runJoinRequestStatusSchema,
  message: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedById: z.string().nullable(),
});
export type RunJoinRequestDto = z.infer<typeof runJoinRequestSchema>;

export const assignableRunRoleSchema = z.enum(["ORGANIZER", "PLAYER"]);
export type AssignableRunRole = z.infer<typeof assignableRunRoleSchema>;

export const addRunMemberRequestSchema = z.object({
  duelistId: z.string().trim().min(1),
  role: assignableRunRoleSchema.optional(),
});
export type AddRunMemberRequest = z.infer<typeof addRunMemberRequestSchema>;

export const createRunRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).nullable().optional(),
  campaignImageAssetId: z.string().trim().min(1).nullable().optional(),
  region: campaignRegionSchema.optional(),
  language: z.string().trim().min(2).max(16).optional(),
  timeZone: z.string().trim().min(1).max(80).optional(),
  visibility: campaignVisibilitySchema.optional(),
  joinType: campaignJoinTypeSchema.optional(),
  maxPlayers: z.number().int().min(2).max(10_000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  startingCredits: z.number().int().min(0).max(999_999).optional(),
  defaultPackPrice: z.number().int().min(0).max(99_999).optional(),
  defaultDisplaySize: z.number().int().min(1).max(120).optional(),
  freePacksPerSetUnlock: z.number().int().min(0).max(240).optional(),
  initialSetUnlockCount: z.number().int().min(0).max(100).optional(),
  setsPerProgressionStep: z.number().int().min(1).max(20).optional(),
  separatePromoProgression: z.boolean().optional(),
  tournamentWinnerCredits: z.number().int().min(0).max(999_999).optional(),
  tournamentRunnerUpCredits: z.number().int().min(0).max(999_999).optional(),
  tournamentParticipationCredits: z.number().int().min(0).max(999_999).optional(),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const joinRunRequestSchema = z.object({
  inviteCode: z.string().trim().min(1).max(32),
  message: z.string().trim().max(400).nullable().optional(),
});
export type JoinRunRequest = z.infer<typeof joinRunRequestSchema>;

export const decideRunJoinRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
});
export type DecideRunJoinRequest = z.infer<typeof decideRunJoinRequestSchema>;

export const updateRunSettingsRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  campaignImageAssetId: z.string().trim().min(1).nullable().optional(),
  region: campaignRegionSchema.optional(),
  language: z.string().trim().min(2).max(16).optional(),
  timeZone: z.string().trim().min(1).max(80).optional(),
  visibility: campaignVisibilitySchema.optional(),
  joinType: campaignJoinTypeSchema.optional(),
  maxPlayers: z.number().int().min(2).max(10_000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  status: runStatusSchema.optional(),
  defaultPackPrice: z.number().int().min(0).max(99_999).optional(),
  defaultDisplaySize: z.number().int().min(1).max(120).optional(),
  freePacksPerSetUnlock: z.number().int().min(0).max(240).optional(),
  initialSetUnlockCount: z.number().int().min(0).max(100).optional(),
  setsPerProgressionStep: z.number().int().min(1).max(20).optional(),
  separatePromoProgression: z.boolean().optional(),
  tournamentWinnerCredits: z.number().int().min(0).max(999_999).optional(),
  tournamentRunnerUpCredits: z.number().int().min(0).max(999_999).optional(),
  tournamentParticipationCredits: z.number().int().min(0).max(999_999).optional(),
});
export type UpdateRunSettingsRequest = z.infer<
  typeof updateRunSettingsRequestSchema
>;

export const packAvailabilityStatusSchema = z.enum([
  "AVAILABLE",
  "LOCKED",
  "SCHEDULED",
]);
export type PackAvailabilityStatus = z.infer<typeof packAvailabilityStatusSchema>;

export const campaignPackKindSchema = z.enum(["SET", "CUSTOM"]);
export type CampaignPackKind = z.infer<typeof campaignPackKindSchema>;

export const campaignPackAccessSchema = z.object({
  accessId: z.string().nullable(),
  kind: campaignPackKindSchema,
  productId: z.string(),
  name: z.string(),
  code: z.string(),
  imageUrl: z.string().nullable(),
  availabilityStatus: packAvailabilityStatusSchema,
  isAvailableNow: z.boolean(),
  availableFrom: z.string().nullable(),
  availableUntil: z.string().nullable(),
  price: z.number().int().nullable(),
  displaySize: z.number().int().nullable(),
  rewardOnly: z.boolean(),
  unlockedAt: z.string().nullable(),
  statusReason: z.string().nullable(),
});
export type CampaignPackAccessDto = z.infer<typeof campaignPackAccessSchema>;

export const campaignPackAccessResponseSchema = z.object({
  runId: z.string(),
  viewerRole: runRoleSchema,
  items: z.array(campaignPackAccessSchema),
});
export type CampaignPackAccessResponse = z.infer<
  typeof campaignPackAccessResponseSchema
>;

export const updateCampaignPackAccessRequestSchema = z.object({
  kind: campaignPackKindSchema,
  productId: z.string().trim().min(1),
  availabilityStatus: packAvailabilityStatusSchema,
  availableFrom: z.string().datetime().nullable().optional(),
  availableUntil: z.string().datetime().nullable().optional(),
  price: z.number().int().min(0).max(99_999).nullable().optional(),
  displaySize: z.number().int().min(1).max(120).nullable().optional(),
  rewardOnly: z.boolean().optional(),
  reason: z.string().trim().min(1).max(400),
}).superRefine((input, context) => {
  if (input.availabilityStatus === "SCHEDULED" && !input.availableFrom) {
    context.addIssue({
      code: "custom",
      path: ["availableFrom"],
      message: "Eine geplante Freigabe benötigt einen Startzeitpunkt.",
    });
  }
  if (input.availableFrom && input.availableUntil
    && new Date(input.availableFrom) >= new Date(input.availableUntil)) {
    context.addIssue({
      code: "custom",
      path: ["availableUntil"],
      message: "Das Enddatum muss nach dem Startdatum liegen.",
    });
  }
});
export type UpdateCampaignPackAccessRequest = z.infer<
  typeof updateCampaignPackAccessRequestSchema
>;

export const updateActiveRunRequestSchema = z.object({
  runId: z.string().trim().min(1),
});
export type UpdateActiveRunRequest = z.infer<
  typeof updateActiveRunRequestSchema
>;

export const creditWalletSchema = z.object({
  id: z.string(),
  runId: z.string(),
  userId: z.string(),
  balance: z.number().int(),
  reservedBalance: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
});
export type CreditWalletDto = z.infer<typeof creditWalletSchema>;

export const creditLedgerEntrySchema = z.object({
  id: z.string(),
  runId: z.string(),
  userId: z.string(),
  amount: z.number().int(),
  balanceAfter: z.number().int(),
  source: creditLedgerSourceSchema,
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditLedgerEntryDto = z.infer<typeof creditLedgerEntrySchema>;

export const runListResponseSchema = z.object({
  activeRunId: z.string().nullable(),
  runs: z.array(playGroupRunSchema),
});
export type RunListResponse = z.infer<typeof runListResponseSchema>;

export const activeRunResponseSchema = z.object({
  run: playGroupRunSchema,
  wallet: creditWalletSchema,
});
export type ActiveRunResponse = z.infer<typeof activeRunResponseSchema>;

export const joinRunResponseSchema = z.union([
  activeRunResponseSchema,
  z.object({
    joinRequest: runJoinRequestSchema,
  }),
]);
export type JoinRunResponse = z.infer<typeof joinRunResponseSchema>;

export const startingPackChoiceResponseSchema = z.object({
  enabled: z.boolean(),
  packQuantity: z.number().int().min(0),
  selectedSetId: z.string().nullable(),
  options: z.array(z.object({
    setId: z.string(),
    code: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
  })),
});
export type StartingPackChoiceResponse = z.infer<typeof startingPackChoiceResponseSchema>;

export const chooseStartingPackRequestSchema = z.object({
  setId: z.string().trim().min(1),
});
export type ChooseStartingPackRequest = z.infer<typeof chooseStartingPackRequestSchema>;

export const walletResponseSchema = z.object({
  wallet: creditWalletSchema,
  recentEntries: z.array(creditLedgerEntrySchema),
});
export type WalletResponse = z.infer<typeof walletResponseSchema>;

export const openRunPackRequestSchema = z.object({
  setId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(120).nullable().optional(),
});
export type OpenRunPackRequest = z.infer<typeof openRunPackRequestSchema>;

export const openDisplayRequestSchema = openRunPackRequestSchema;
export type OpenDisplayRequest = z.infer<typeof openDisplayRequestSchema>;

export const packOpeningBatchSchema = z.object({
  id: z.string(),
  runId: z.string(),
  userId: z.string(),
  setId: z.string(),
  type: z.enum(["SINGLE_PACK", "DISPLAY", "REWARD"]),
  quantity: z.number().int(),
  totalCost: z.number().int(),
  createdAt: z.string(),
});
export type PackDisplayOpeningDto = z.infer<typeof packOpeningBatchSchema>;

export const openDisplayResponseSchema = z.object({
  batch: packOpeningBatchSchema,
  openings: z.array(packOpeningSummarySchema),
  wallet: creditWalletSchema,
});
export type OpenDisplayResponse = z.infer<typeof openDisplayResponseSchema>;

export const historyEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: historyEventTypeSchema,
  eventDate: z.string().nullable(),
  isUnlocked: z.boolean(),
  rewardConfig: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HistoryEventDto = z.infer<typeof historyEventSchema>;

export const createHistoryEventRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(800).nullable().optional(),
  type: historyEventTypeSchema.optional(),
  eventDate: z.string().trim().min(1).nullable().optional(),
  isUnlocked: z.boolean().optional(),
  rewardConfig: z.unknown().nullable().optional(),
});
export type CreateHistoryEventRequest = z.infer<
  typeof createHistoryEventRequestSchema
>;

export const rewardGrantSchema = z.object({
  id: z.string(),
  runId: z.string(),
  recipientId: z.string(),
  grantedById: z.string().nullable(),
  amountCredits: z.number().int(),
  packSetId: z.string().nullable(),
  customPackVersionId: z.string().nullable(),
  packQuantity: z.number().int(),
  reason: z.string().nullable(),
  status: rewardGrantStatusSchema,
  createdAt: z.string(),
  claimedAt: z.string().nullable(),
});
export type RewardGrantDto = z.infer<typeof rewardGrantSchema>;

export const rewardGrantPackSetSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  packSize: z.number().int(),
  imageUrl: z.string().nullable(),
});
export type RewardGrantPackSetDto = z.infer<typeof rewardGrantPackSetSchema>;

export const runRewardGrantSchema = rewardGrantSchema.extend({
  packSet: rewardGrantPackSetSchema.nullable(),
  customPack: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    version: z.number().int(),
    packSize: z.number().int(),
    imageUrl: z.string().nullable(),
  }).nullable(),
});
export type RunRewardGrantDto = z.infer<typeof runRewardGrantSchema>;

export const runRewardsResponseSchema = z.object({
  rewards: z.array(runRewardGrantSchema),
});
export type RunRewardsResponse = z.infer<typeof runRewardsResponseSchema>;

export const claimRewardResponseSchema = z.object({
  reward: runRewardGrantSchema,
  batch: packOpeningBatchSchema,
  openings: z.array(packOpeningSummarySchema),
});
export type ClaimRewardResponse = z.infer<typeof claimRewardResponseSchema>;

export const createRewardGrantRequestSchema = z.object({
  recipientDuelistId: z.string().trim().min(1),
  amountCredits: z.number().int().min(0).max(999_999).optional(),
  packSetId: z.string().trim().min(1).nullable().optional(),
  customPackVersionId: z.string().trim().min(1).nullable().optional(),
  packQuantity: z.number().int().min(0).max(120).optional(),
  reason: z.string().trim().max(400).nullable().optional(),
}).superRefine((input, context) => {
  if (input.packSetId && input.customPackVersionId) {
    context.addIssue({ code: "custom", path: ["customPackVersionId"], message: "Ein Reward kann nur eine Packquelle verwenden." });
  }
});
export type CreateRewardGrantRequest = z.infer<
  typeof createRewardGrantRequestSchema
>;

export const runProgressionUnlockSchema = z.object({
  id: z.string(),
  checkpointId: z.string(),
  runId: z.string(),
  type: runProgressionUnlockTypeSchema,
  setId: z.string().nullable(),
  setName: z.string().nullable(),
  setCode: z.string().nullable(),
  promoSourceId: z.string().nullable(),
  promoSourceName: z.string().nullable(),
  historyEventId: z.string().nullable(),
  historyEventTitle: z.string().nullable(),
  rewardConfig: z.unknown().nullable(),
});
export type RunProgressionUnlockDto = z.infer<
  typeof runProgressionUnlockSchema
>;

export const runProgressionCheckpointSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sequence: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  unlockDate: z.string().nullable(),
  requiredTournamentId: z.string().nullable(),
  status: runProgressionStatusSchema,
  appliedAt: z.string().nullable(),
  unlocks: z.array(runProgressionUnlockSchema),
});
export type RunProgressionCheckpointDto = z.infer<
  typeof runProgressionCheckpointSchema
>;

export const runProgressionResponseSchema = z.object({
  run: z.object({
    id: z.string(),
    name: z.string(),
    historyCursor: z.string().nullable(),
    viewerRole: runRoleSchema,
  }),
  currentCheckpoint: runProgressionCheckpointSchema.nullable(),
  nextCheckpoint: runProgressionCheckpointSchema.nullable(),
  readyCheckpoints: z.array(runProgressionCheckpointSchema),
});
export type RunProgressionResponse = z.infer<
  typeof runProgressionResponseSchema
>;

export const applyRunProgressionResponseSchema = z.object({
  checkpoint: runProgressionCheckpointSchema,
  progression: runProgressionResponseSchema,
});
export type ApplyRunProgressionResponse = z.infer<
  typeof applyRunProgressionResponseSchema
>;

export const applyRunProgressionRequestSchema = z.object({
  force: z.boolean().optional(),
});
export type ApplyRunProgressionRequest = z.infer<
  typeof applyRunProgressionRequestSchema
>;

export const generateRunProgressionRequestSchema = z.object({
  count: z.number().int().min(1).max(50).optional(),
  fromDate: z.string().trim().min(1).nullable().optional(),
  includeTournamentPacks: z.boolean().optional(),
});
export type GenerateRunProgressionRequest = z.infer<
  typeof generateRunProgressionRequestSchema
>;

export const generateRunProgressionResponseSchema = z.object({
  generatedCheckpoints: z.array(runProgressionCheckpointSchema),
  progression: runProgressionResponseSchema,
});
export type GenerateRunProgressionResponse = z.infer<
  typeof generateRunProgressionResponseSchema
>;

export const promoSourceCardSchema = z.object({
  setCardId: z.string(),
  cardId: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  rarity: z.string().nullable(),
  setCode: z.string(),
  claimedCopies: z.number().int(),
});
export type PromoSourceCardDto = z.infer<typeof promoSourceCardSchema>;

export const promoSourceSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sourceType: promoSourceTypeSchema,
  claimMode: promoClaimModeSchema,
  availableFrom: z.string().nullable(),
  isUnlocked: z.boolean(),
  unlockedAt: z.string().nullable(),
  cards: z.array(promoSourceCardSchema),
});
export type PromoSourceDto = z.infer<typeof promoSourceSchema>;

export const promoClaimSchema = z.object({
  id: z.string(),
  runId: z.string(),
  promoSourceId: z.string(),
  userId: z.string(),
  setCardId: z.string(),
  collectionEntryId: z.string().nullable(),
  claimedAt: z.string(),
});
export type PromoClaimDto = z.infer<typeof promoClaimSchema>;

export const runPromosResponseSchema = z.object({
  sources: z.array(promoSourceSchema),
});
export type RunPromosResponse = z.infer<typeof runPromosResponseSchema>;

export const claimPromoRequestSchema = z.object({
  setCardId: z.string().trim().min(1),
});
export type ClaimPromoRequest = z.infer<typeof claimPromoRequestSchema>;

export const claimPromoResponseSchema = z.object({
  claim: promoClaimSchema,
  source: promoSourceSchema,
});
export type ClaimPromoResponse = z.infer<typeof claimPromoResponseSchema>;

export const syncBootstrapResponseSchema = z.object({
  serverTime: z.string(),
  cursor: z.string(),
  viewer: z.object({
    userId: z.string(),
    duelistId: z.string(),
    displayName: z.string(),
  }),
  activeRunId: z.string().nullable(),
  catalog: z.object({
    cards: z.number().int(),
    sets: z.number().int(),
    openableSets: z.number().int(),
    banlists: z.number().int(),
    packSets: z.array(
      z.object({
        id: z.string(),
        code: z.string(),
        name: z.string(),
        releaseDate: z.string(),
        productType: z.string(),
        packSize: z.number().int(),
        imageUrl: z.string().nullable(),
        cardPoolSize: z.number().int(),
      }),
    ),
    runSetUnlocks: z.array(
      z.object({
        id: z.string(),
        setId: z.string(),
        unlockedAt: z.string(),
        rewardOnly: z.boolean(),
        packPrice: z.number().int().nullable(),
        displaySize: z.number().int().nullable(),
      }),
    ),
  }),
  run: z.unknown().nullable(),
  wallet: z.unknown().nullable(),
  counts: z.object({
    collectionEntries: z.number().int(),
    decks: z.number().int(),
    binders: z.number().int(),
    trades: z.number().int(),
    tournaments: z.number().int(),
    pendingRewards: z.number().int(),
  }),
});
export type SyncBootstrapResponse = z.infer<typeof syncBootstrapResponseSchema>;

export const syncChangesResponseSchema = z.object({
  serverTime: z.string(),
  cursor: z.string(),
  hasMore: z.boolean(),
  changes: z.object({
    collectionEntries: z.array(z.unknown()),
    decks: z.array(z.unknown()),
    binders: z.array(z.unknown()),
    trades: z.array(z.unknown()),
    tournaments: z.array(z.unknown()),
    packOpenings: z.array(z.unknown()),
    rewards: z.array(z.unknown()),
  }),
});
export type SyncChangesResponse = z.infer<typeof syncChangesResponseSchema>;

export const campaignRulePresetSchema = z.enum([
  "CLASSIC_PROGRESSION",
  "SEALED_LEAGUE",
  "DRAFT_CUBE",
  "TOURNAMENT_LADDER",
  "CUSTOM",
]);
export type CampaignRulePreset = z.infer<typeof campaignRulePresetSchema>;

export const campaignRuleVersionStatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "SUPERSEDED",
]);

export const campaignRuleConfigSchema = z.object({
  economy: z.object({
    startingCredits: z.number().int().min(0),
    creditLimit: z.number().int().min(0).nullable().default(null),
    packPrice: z.number().int().min(0),
    displaySize: z.number().int().min(1).max(100),
    bundleSize: z.number().int().min(1).max(100).default(3),
    bundlePrice: z.number().int().min(0).nullable().default(null),
    packPurchaseLimitPerDay: z.number().int().min(1).nullable().default(null),
    displayPurchaseLimitPerDay: z.number().int().min(1).nullable().default(null),
    bundlePurchaseLimitPerDay: z.number().int().min(1).nullable().default(null),
    purchaseTypes: z.array(z.enum(["PACK", "DISPLAY", "BUNDLE"])).min(1).default(["PACK", "DISPLAY"]),
  }),
  progression: z.object({
    initialSetUnlockCount: z.number().int().min(0).max(100),
    setsPerStep: z.number().int().min(1).max(25),
    freePacksPerSetUnlock: z.number().int().min(0).max(1000),
    separatePromoProgression: z.boolean(),
    catchUpMode: z.enum(["NONE", "MATCH_CURRENT", "HOST_GRANT"]).default("NONE"),
    startingPackMode: z.enum(["NONE", "FIXED", "RANDOM", "PLAYER_CHOICE"]).default("NONE"),
    startingPackCount: z.number().int().min(0).max(1000).default(0),
    startingSetIds: z.array(z.string()).default([]),
    startingCardIds: z.array(z.string()).default([]),
    starterDeckIds: z.array(z.string()).default([]),
    progressionModes: z.array(z.enum(["MANUAL", "DATE", "TOURNAMENT", "MATCHES", "EVENT"])).min(1).default(["MANUAL", "TOURNAMENT"]),
    allowReleaseOrder: z.boolean().default(true),
    allowCustomOrder: z.boolean().default(false),
    allowPlayerVote: z.boolean().default(false),
    unlockReprints: z.boolean().default(true),
    allowBackwardUnlocks: z.boolean().default(false),
    timedEventsEnabled: z.boolean().default(false),
  }),
  collection: z.object({
    duplicateRule: z.enum(["KEEP_ALL", "CAP_COPIES", "CONVERT_CREDITS"]).default("KEEP_ALL"),
    printingSpecificBinders: z.boolean().default(true),
    physicalCopyReservation: z.boolean().default(true),
    allowPackDuplicates: z.boolean().default(true),
    printingIdentity: z.enum(["CARD", "PRINTING", "PHYSICAL_COPY"]).default("PHYSICAL_COPY"),
    collectionEntryLimit: z.number().int().min(1).nullable().default(null),
    maxCopiesPerCard: z.number().int().min(1).nullable().default(null),
    dustingEnabled: z.boolean().default(false),
    dustingCreditsPerCard: z.number().int().min(0).default(0),
    binderLimit: z.number().int().min(1).nullable().default(null),
    binderPageLimit: z.number().int().min(1).nullable().default(null),
  }),
  decks: z.object({
    allowProxies: z.boolean().default(false),
    minMainDeck: z.number().int().min(1).max(100).default(40),
    maxMainDeck: z.number().int().min(1).max(100).default(60),
    maxExtraDeck: z.number().int().min(0).max(30).default(15),
    maxSideDeck: z.number().int().min(0).max(30).default(15),
    tournamentDeckLock: z.boolean().default(true),
    ownershipRequired: z.boolean().default(true),
    allowedFormatKeys: z.array(z.string()).default([]),
    allowMultipleFormats: z.boolean().default(false),
    deckVisibility: z.enum(["PRIVATE", "FRIENDS", "CAMPAIGN", "PUBLIC"]).default("PRIVATE"),
  }),
  trades: z.object({
    enabled: z.boolean().default(true),
    allowCredits: z.boolean().default(false),
    reservationMinutes: z.number().int().min(1).max(10080).default(1440),
    modes: z.array(z.enum(["DIRECT", "AUCTION", "DRAFT_WINDOW"])).min(1).default(["DIRECT"]),
    minimumMembershipDays: z.number().int().min(0).max(3650).default(0),
    organizerApproval: z.boolean().default(false),
    maxCardsPerTrade: z.number().int().min(1).nullable().default(null),
    maxCreditsPerTrade: z.number().int().min(1).nullable().default(null),
    tradeWindowStart: z.string().datetime().nullable().default(null),
    tradeWindowEnd: z.string().datetime().nullable().default(null),
  }),
  tournaments: z.object({
    matchMode: z.enum(["BEST_OF_ONE", "BEST_OF_THREE", "BEST_OF_FIVE", "SINGLE"]).default("BEST_OF_THREE"),
    pairingMode: z.enum(["SWISS", "ROUND_ROBIN", "SINGLE_ELIMINATION", "MANUAL"]).default("SWISS"),
    allowedPairingModes: z.array(z.enum(["SWISS", "ROUND_ROBIN", "SINGLE_ELIMINATION", "MANUAL"])).min(1).default(["SWISS"]),
    allowedMatchModes: z.array(z.enum(["BEST_OF_ONE", "BEST_OF_THREE", "BEST_OF_FIVE"])).min(1).default(["BEST_OF_THREE"]),
    requireResultConfirmation: z.boolean().default(true),
    requireDeckRegistration: z.boolean().default(false),
    minimumParticipants: z.number().int().min(2).max(1024).default(2),
    rewardsRepeatable: z.boolean().default(true),
    rewardSources: z.array(z.enum(["CREDITS", "STANDARD_PACK", "CUSTOM_PACK", "PROMO", "FIXED_CARD"])).default(["CREDITS", "STANDARD_PACK"]),
    winnerCredits: z.number().int().min(0),
    runnerUpCredits: z.number().int().min(0),
    participationCredits: z.number().int().min(0),
  }),
  audit: z.object({
    requireReasonForChanges: z.boolean().default(true),
    activationMode: z.enum(["IMMEDIATE", "AT_DATE", "NEXT_PROGRESSION_STEP"]).default("IMMEDIATE"),
  }),
}).superRefine((config, context) => {
  if (config.decks.minMainDeck > config.decks.maxMainDeck) {
    context.addIssue({
      code: "custom",
      path: ["decks", "minMainDeck"],
      message: "Die minimale Main-Deck-Größe darf nicht über dem Maximum liegen.",
    });
  }
  if (
    config.economy.creditLimit !== null
    && config.economy.startingCredits > config.economy.creditLimit
  ) {
    context.addIssue({
      code: "custom",
      path: ["economy", "creditLimit"],
      message: "Das Credit-Limit darf nicht unter den Start-Credits liegen.",
    });
  }
  if (
    config.trades.tradeWindowStart
    && config.trades.tradeWindowEnd
    && new Date(config.trades.tradeWindowStart) >= new Date(config.trades.tradeWindowEnd)
  ) {
    context.addIssue({
      code: "custom",
      path: ["trades", "tradeWindowEnd"],
      message: "Das Ende des Tauschfensters muss nach dem Beginn liegen.",
    });
  }
});
export type CampaignRuleConfig = z.infer<typeof campaignRuleConfigSchema>;

export const createCampaignRuleVersionRequestSchema = z.object({
  preset: campaignRulePresetSchema.default("CUSTOM"),
  config: campaignRuleConfigSchema,
  reason: z.string().trim().max(400).nullable().optional(),
  effectiveAt: z.string().datetime().nullable().optional(),
  effectiveCheckpointId: z.string().trim().min(1).nullable().optional(),
  activateImmediately: z.boolean().default(false),
});
export type CreateCampaignRuleVersionRequest = z.infer<typeof createCampaignRuleVersionRequestSchema>;

export const campaignRuleVersionSchema = z.object({
  id: z.string(),
  runId: z.string(),
  version: z.number().int(),
  status: campaignRuleVersionStatusSchema,
  preset: campaignRulePresetSchema.nullable(),
  config: campaignRuleConfigSchema,
  effectiveAt: z.string().nullable(),
  effectiveCheckpointId: z.string().nullable(),
  createdById: z.string(),
  changeReason: z.string().nullable(),
  createdAt: z.string(),
  activatedAt: z.string().nullable(),
});
export type CampaignRuleVersionDto = z.infer<typeof campaignRuleVersionSchema>;

export const customPackEraSchema = z.enum(["EARLY_TCG", "GX_5DS", "MODERN_CORE", "PROMO_CUSTOM"]);
export type CustomPackEra = z.infer<typeof customPackEraSchema>;
export const customPackStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const customPackPoolEntryInputSchema = z.object({
  cardId: z.string().trim().min(1),
  setCardId: z.string().trim().min(1).nullable().optional(),
  rarity: z.string().trim().min(1).max(40),
  weight: z.number().int().min(1).max(1_000_000).default(1),
});
export const customPackRarityOptionInputSchema = z.object({
  rarity: z.string().trim().min(1).max(40),
  weight: z.number().int().min(1).max(1_000_000),
});
export const customPackSlotInputSchema = z.object({
  slotIndex: z.number().int().min(0).max(99),
  count: z.number().int().min(1).max(100).default(1),
  allowedRarities: z.array(z.string().trim().min(1)).min(1),
  weight: z.number().int().min(1).max(1_000_000).default(1),
  rarityOptions: z.array(customPackRarityOptionInputSchema).min(1).optional(),
});
export const createCustomPackRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().trim().max(1000).nullable().optional(),
  era: customPackEraSchema,
  packSize: z.number().int().min(1).max(100).default(9),
  displaySize: z.number().int().min(1).max(100).default(24),
  price: z.number().int().min(0).default(100),
  artworkAssetId: z.string().trim().min(1).nullable().optional(),
});
export type CreateCustomPackRequest = z.infer<typeof createCustomPackRequestSchema>;
export const updateCustomPackDraftRequestSchema = z.object({
  poolEntries: z.array(customPackPoolEntryInputSchema).max(5_000),
  slots: z.array(customPackSlotInputSchema).min(1).max(100),
  packSize: z.number().int().min(1).max(100).optional(),
  displaySize: z.number().int().min(1).max(100).optional(),
  price: z.number().int().min(0).max(1_000_000).optional(),
  artworkAssetId: z.string().trim().min(1).nullable().optional(),
}).superRefine((draft, context) => {
  const slotIndexes = new Set<number>();
  draft.slots.forEach((slot, index) => {
    if (slotIndexes.has(slot.slotIndex)) {
      context.addIssue({
        code: "custom",
        path: ["slots", index, "slotIndex"],
        message: "Jeder Slot-Index darf nur einmal vorkommen.",
      });
    }
    slotIndexes.add(slot.slotIndex);

    const configuredRarities = slot.rarityOptions?.map((option) => option.rarity)
      ?? slot.allowedRarities;
    if (new Set(configuredRarities).size !== configuredRarities.length) {
      context.addIssue({
        code: "custom",
        path: ["slots", index, slot.rarityOptions ? "rarityOptions" : "allowedRarities"],
        message: "Eine Seltenheit darf pro Slot nur einmal vorkommen.",
      });
    }
  });

  const poolKeys = new Set<string>();
  draft.poolEntries.forEach((entry, index) => {
    const key = `${entry.cardId}:${entry.rarity}:${entry.setCardId ?? "default"}`;
    if (poolKeys.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["poolEntries", index],
        message: "Doppelte Karten-Pool-Einträge sind nicht erlaubt.",
      });
    }
    poolKeys.add(key);
  });
});
export type UpdateCustomPackDraftRequest = z.infer<typeof updateCustomPackDraftRequestSchema>;

export const mediaAssetKindSchema = z.enum([
  "AVATAR",
  "CAMPAIGN_IMAGE",
  "PACK_ARTWORK",
  "BINDER_COVER",
  "DECKBOX",
]);
export type MediaAssetKind = z.infer<typeof mediaAssetKindSchema>;

export const mediaAssetDtoSchema = z.object({
  id: z.string(),
  kind: mediaAssetKindSchema,
  name: z.string(),
  imageUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  byteSize: z.number().int(),
  createdAt: z.string(),
  usageCount: z.number().int().nonnegative(),
  deletable: z.boolean(),
});
export type MediaAssetDto = z.infer<typeof mediaAssetDtoSchema>;

export const createMediaUploadIntentRequestSchema = z.object({
  kind: mediaAssetKindSchema,
  name: z.string().trim().min(1).max(80),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().min(1).max(5 * 1024 * 1024),
});
export type CreateMediaUploadIntentRequest = z.infer<typeof createMediaUploadIntentRequestSchema>;

export const finalizeMediaUploadRequestSchema = z.object({
  uploadToken: z.string().trim().min(1),
});
export type FinalizeMediaUploadRequest = z.infer<typeof finalizeMediaUploadRequestSchema>;

export const updateMediaAssetRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type UpdateMediaAssetRequest = z.infer<typeof updateMediaAssetRequestSchema>;
export const simulateCustomPackRequestSchema = z.object({
  iterations: z.number().int().min(1).max(10_000).default(10_000),
  seed: z.string().trim().min(1).max(200).default("duel-hub-simulation"),
});
export type SimulateCustomPackRequest = z.infer<typeof simulateCustomPackRequestSchema>;

export const openCustomPackRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
});
export type OpenCustomPackRequest = z.infer<typeof openCustomPackRequestSchema>;
