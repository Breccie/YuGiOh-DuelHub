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
  password: z.string().trim().min(6),
  displayName: z.string().trim().min(1),
  favoriteEra: z.string().trim().max(40).nullable().optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const createDeckRequestSchema = z.object({
  name: z.string().trim().min(1),
  banlistId: z.string().trim().min(1).nullable().optional(),
  snapshotDate: z.string().trim().min(1).nullable().optional(),
});
export type CreateDeckRequest = z.infer<typeof createDeckRequestSchema>;

export const updateDeckRequestSchema = createDeckRequestSchema;
export type UpdateDeckRequest = z.infer<typeof updateDeckRequestSchema>;

export const deckSectionSchema = z.enum(["MAIN", "EXTRA", "SIDE"]);
export type DeckSectionValue = z.infer<typeof deckSectionSchema>;

export const removeDeckCardRequestSchema = z.object({
  cardId: z.string().trim().min(1),
  section: deckSectionSchema,
});
export type RemoveDeckCardRequest = z.infer<typeof removeDeckCardRequestSchema>;

export const upsertDeckCardRequestSchema = removeDeckCardRequestSchema.extend({
  quantity: z.number().int().min(1).max(60),
});
export type UpsertDeckCardRequest = z.infer<typeof upsertDeckCardRequestSchema>;

export const deckExportRequestSchema = z.object({
  exportPath: z.string().trim().min(1).nullable().optional(),
  fileName: z.string().trim().min(1).nullable().optional(),
  linkedDuelRequestId: z.string().trim().min(1).nullable().optional(),
  linkedTournamentMatchId: z.string().trim().min(1).nullable().optional(),
});
export type DeckExportRequest = z.infer<typeof deckExportRequestSchema>;

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
});
export type CreateTradeRequest = z.infer<typeof createTradeRequestSchema>;

export const createTradeVersionRequestSchema = z.object({
  note: z.string().trim().max(400).nullable().optional(),
  offeredEntryIds: z.array(z.string().trim().min(1)).default([]),
  requestedEntryIds: z.array(z.string().trim().min(1)).default([]),
});
export type CreateTradeVersionRequest = z.infer<typeof createTradeVersionRequestSchema>;

export const tradeDecisionRequestSchema = z.object({
  action: z.enum(["accept", "reject", "cancel", "confirmCompletion"]),
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
  description: z.string().trim().max(240).nullable().optional(),
});
export type CreateCollectionBinderRequest = z.infer<
  typeof createCollectionBinderRequestSchema
>;

export const updateCollectionBinderRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  coverKey: z.string().trim().min(1).optional(),
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
  isPublic: z.boolean().optional(),
  showcaseBinderId: z.string().trim().min(1).nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const createTournamentRequestSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().max(400).nullable().optional(),
  formatLabel: z.string().trim().max(80).nullable().optional(),
  scheduledAt: z.string().trim().min(1).nullable().optional(),
});
export type CreateTournamentRequest = z.infer<typeof createTournamentRequestSchema>;

export const inviteTournamentParticipantRequestSchema = z.object({
  duelistId: z.string().trim().min(1),
});
export type InviteTournamentParticipantRequest = z.infer<
  typeof inviteTournamentParticipantRequestSchema
>;

export const recordTournamentMatchResultRequestSchema = z.object({
  playerOneScore: z.number().int().min(0),
  playerTwoScore: z.number().int().min(0),
  winnerId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional(),
});
export type RecordTournamentMatchResultRequest = z.infer<
  typeof recordTournamentMatchResultRequestSchema
>;

export const openPackRequestSchema = z.object({
  setId: z.string().trim().min(1).optional(),
});
export type OpenPackRequest = z.infer<typeof openPackRequestSchema>;

export type PublicProfile = {
  userId: string;
  duelistId: string;
  displayName: string;
  avatarKey: string;
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
    updatedAt: string;
    cardCount: number;
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
  };
  addressee: {
    userId: string;
    duelistId: string;
    displayName: string;
  };
};

export const publicProfileSchema = z.object({
  userId: z.string(),
  duelistId: z.string(),
  displayName: z.string(),
  avatarKey: z.string(),
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
      updatedAt: z.string(),
      cardCount: z.number().int(),
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
  }),
  addressee: z.object({
    userId: z.string(),
    duelistId: z.string(),
    displayName: z.string(),
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
};

export type TradeVersionDraft = {
  note: string | null;
  offeredEntryIds: string[];
  requestedEntryIds: string[];
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
  isActive: boolean;
  isAccepted: boolean;
};

export type TradeTimelineEntryDto = {
  id: string;
  type:
    | "VERSION_CREATED"
    | "TRADE_ACCEPTED"
    | "TRADE_CONFIRMED"
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
  | "confirmCompletion";

export type TradeThreadState =
  | "awaitingYourResponse"
  | "waitingForTheirResponse"
  | "waitingForYourConfirmation"
  | "waitingForTheirConfirmation"
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
  acceptedVersionId: string | null;
  proposerConfirmedAt: string | null;
  responderConfirmedAt: string | null;
  cancelledByUserId: string | null;
  rejectedByUserId: string | null;
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
  latestBanlistName: z.string(),
  activeEra: z.string(),
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
    }),
  ),
  recentOpenings: z.array(packOpeningSummarySchema),
});
export type PackDashboardSnapshotDto = z.infer<typeof packDashboardSnapshotSchema>;

export const packSelectionResponseSchema = z.object({
  viewer: z.object({
    displayName: z.string(),
  }),
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
export const creditLedgerSourceSchema = z.enum([
  "STARTING_BALANCE",
  "PACK_PURCHASE",
  "DISPLAY_PURCHASE",
  "DUEL_REWARD",
  "TOURNAMENT_REWARD",
  "ORGANIZER_ADJUSTMENT",
  "MANUAL_GRANT",
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
  description: z.string().nullable(),
  status: runStatusSchema,
  historyCursor: z.string().nullable(),
  defaultPackPrice: z.number().int(),
  defaultDisplaySize: z.number().int(),
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

export const addRunMemberRequestSchema = z.object({
  duelistId: z.string().trim().min(1),
  role: runRoleSchema.optional(),
});
export type AddRunMemberRequest = z.infer<typeof addRunMemberRequestSchema>;

export const createRunRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).nullable().optional(),
  startingCredits: z.number().int().min(0).max(999_999).optional(),
  defaultPackPrice: z.number().int().min(0).max(99_999).optional(),
  defaultDisplaySize: z.number().int().min(1).max(120).optional(),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

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
  packQuantity: z.number().int().min(0).max(120).optional(),
  reason: z.string().trim().max(400).nullable().optional(),
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
