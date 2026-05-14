import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OVERLORD_ID = "5772a3a1-4c7e-4da0-9e18-72b327db736c";
const STAMAT_AGENT_ID = "aaaa-bbbb-cccc-dddd";
const TODOR_USER_ID = "user-todor-1";
const ASSIGNEE_AGENT_ID = "11111111-1111-4111-8111-111111111111";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn(),
  canonicalizeCommentBody: vi.fn(),
  loadMentionDirectory: vi.fn(),
  getRelationSummaries: vi.fn(),
  listWakeableBlockedDependents: vi.fn(),
  getWakeableParentAfterChildCompletion: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(async () => undefined),
  reportRunActivity: vi.fn(async () => undefined),
  getRun: vi.fn(async () => null),
  getActiveRunForAgent: vi.fn(async () => null),
  cancelRun: vi.fn(async () => null),
}));

const mockIssueThreadInteractionService = vi.hoisted(() => ({
  expireRequestConfirmationsSupersededByComment: vi.fn(async () => []),
  expireStaleRequestConfirmationsForIssueDocument: vi.fn(async () => []),
}));

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    companyService: () => ({
      getById: vi.fn(async () => ({ id: "company-1", attachmentMaxBytes: 10 * 1024 * 1024 })),
    }),
    accessService: () => ({
      canUser: vi.fn(async () => true),
      hasPermission: vi.fn(async () => true),
    }),
    agentService: () => ({
      getById: vi.fn(async () => null),
      resolveByReference: vi.fn(async (_companyId: string, raw: string) => ({
        ambiguous: false,
        agent: { id: raw },
      })),
    }),
    documentService: () => ({}),
    executionWorkspaceService: () => ({}),
    feedbackService: () => ({
      listIssueVotesForUser: vi.fn(async () => []),
      saveIssueVote: vi.fn(async () => ({ vote: null, consentEnabledNow: false, sharingEnabled: false })),
    }),
    goalService: () => ({}),
    heartbeatService: () => mockHeartbeatService,
    instanceSettingsService: () => ({
      get: vi.fn(async () => ({
        id: "instance-settings-1",
        general: {
          censorUsernameInLogs: false,
          feedbackDataSharingPreference: "prompt",
        },
      })),
      listCompanyIds: vi.fn(async () => ["company-1"]),
    }),
    issueApprovalService: () => ({}),
    issueReferenceService: () => ({
      deleteDocumentSource: async () => undefined,
      diffIssueReferenceSummary: () => ({
        addedReferencedIssues: [],
        removedReferencedIssues: [],
        currentReferencedIssues: [],
      }),
      emptySummary: () => ({ outbound: [], inbound: [] }),
      listIssueReferenceSummary: async () => ({ outbound: [], inbound: [] }),
      syncComment: async () => undefined,
      syncDocument: async () => undefined,
      syncIssue: async () => undefined,
    }),
    issueRecoveryActionService: () => ({
      getActiveForIssue: vi.fn(async () => null),
      listActiveForIssues: vi.fn(async () => new Map()),
    }),
    issueService: () => mockIssueService,
    issueThreadInteractionService: () => mockIssueThreadInteractionService,
    logActivity: vi.fn(async () => undefined),
    projectService: () => ({}),
    routineService: () => ({
      syncRunStatusForIssue: vi.fn(async () => undefined),
    }),
    workProductService: () => ({}),
  }));
}

async function createApp() {
  const [{ errorHandler }, { issueRoutes }] = await Promise.all([
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    vi.importActual<typeof import("../routes/issues.js")>("../routes/issues.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyId: "company-1",
    status: "in_progress",
    priority: "medium",
    projectId: null,
    goalId: null,
    parentId: null,
    assigneeAgentId: ASSIGNEE_AGENT_ID,
    assigneeUserId: null,
    createdByUserId: "local-board",
    identifier: "HAT-999",
    title: "Canonicalization test",
    executionPolicy: null,
    executionState: null,
    hiddenAt: null,
    ...overrides,
  };
}

describe("issue comment mention canonicalization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/issues.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
    mockIssueService.getRelationSummaries.mockResolvedValue({ blockedBy: [], blocks: [] });
    mockIssueService.listWakeableBlockedDependents.mockResolvedValue([]);
    mockIssueService.getWakeableParentAfterChildCompletion.mockResolvedValue(null);
  });

  describe("PATCH /issues/:id (issue update with comment)", () => {
    it("persists the canonicalized body, not the raw input", async () => {
      const staleBody = `[@Todor](agent://${OVERLORD_ID})`;
      const canonicalizedBody = `[@Todor](user://${TODOR_USER_ID})`;

      mockIssueService.canonicalizeCommentBody.mockResolvedValue(canonicalizedBody);

      const existing = makeIssue();
      const updated = { ...existing };
      mockIssueService.getById.mockResolvedValue(existing);
      mockIssueService.update.mockResolvedValue(updated);
      mockIssueService.addComment.mockResolvedValue({
        id: "comment-1",
        issueId: existing.id,
        companyId: existing.companyId,
        body: canonicalizedBody,
      });

      const res = await request(await createApp())
        .patch(`/api/issues/${existing.id}`)
        .send({ comment: staleBody });

      expect(res.status).toBe(200);

      // canonicalizeCommentBody was called with the raw input
      expect(mockIssueService.canonicalizeCommentBody).toHaveBeenCalledWith(
        existing.companyId,
        staleBody,
      );

      // addComment received the canonicalized body
      expect(mockIssueService.addComment).toHaveBeenCalledWith(
        existing.id,
        canonicalizedBody,
        expect.any(Object),
      );

      // findMentionedAgents received the canonicalized body
      expect(mockIssueService.findMentionedAgents).toHaveBeenCalledWith(
        existing.companyId,
        canonicalizedBody,
      );
    });

    it("stale Todor→Overlord agent:// link does not wake Overlord", async () => {
      const staleBody = `[@Todor](agent://${OVERLORD_ID})`;
      const canonicalizedBody = `[@Todor](user://${TODOR_USER_ID})`;

      mockIssueService.canonicalizeCommentBody.mockResolvedValue(canonicalizedBody);
      // After canonicalization, findMentionedAgents on the clean body finds no agent mentions
      mockIssueService.findMentionedAgents.mockResolvedValue([]);

      const existing = makeIssue();
      const updated = { ...existing };
      mockIssueService.getById.mockResolvedValue(existing);
      mockIssueService.update.mockResolvedValue(updated);
      mockIssueService.addComment.mockResolvedValue({
        id: "comment-1",
        issueId: existing.id,
        companyId: existing.companyId,
        body: canonicalizedBody,
      });

      const res = await request(await createApp())
        .patch(`/api/issues/${existing.id}`)
        .send({ comment: staleBody });

      expect(res.status).toBe(200);

      // No wakeup should be sent to Overlord
      const overlordWakes = mockHeartbeatService.wakeup.mock.calls.filter(
        ([agentId]: [string]) => agentId === OVERLORD_ID,
      );
      expect(overlordWakes).toHaveLength(0);
    });
  });

  describe("POST /issues/:id/comments", () => {
    it("persists the canonicalized body, not the raw input", async () => {
      const staleBody = `[@Todor](agent://${OVERLORD_ID})`;
      const canonicalizedBody = `[@Todor](user://${TODOR_USER_ID})`;

      mockIssueService.canonicalizeCommentBody.mockResolvedValue(canonicalizedBody);
      mockIssueService.findMentionedAgents.mockResolvedValue([]);

      const existing = makeIssue();
      mockIssueService.getById.mockResolvedValue(existing);
      mockIssueService.addComment.mockResolvedValue({
        id: "comment-2",
        issueId: existing.id,
        companyId: existing.companyId,
        body: canonicalizedBody,
      });

      const res = await request(await createApp())
        .post(`/api/issues/${existing.id}/comments`)
        .send({ body: staleBody });

      expect(res.status).toBe(201);

      // canonicalizeCommentBody was called with the raw input
      expect(mockIssueService.canonicalizeCommentBody).toHaveBeenCalledWith(
        existing.companyId,
        staleBody,
      );

      // addComment received the canonicalized body
      expect(mockIssueService.addComment).toHaveBeenCalledWith(
        existing.id,
        canonicalizedBody,
        expect.any(Object),
        expect.any(Object),
      );

      // findMentionedAgents received the canonicalized body
      expect(mockIssueService.findMentionedAgents).toHaveBeenCalledWith(
        existing.companyId,
        canonicalizedBody,
      );
    });

    it("stale agent:// link in POST comment does not wake the wrong agent", async () => {
      const staleBody = `[@UnknownPerson](agent://${STAMAT_AGENT_ID})`;
      const canonicalizedBody = `@UnknownPerson`;

      mockIssueService.canonicalizeCommentBody.mockResolvedValue(canonicalizedBody);
      mockIssueService.findMentionedAgents.mockResolvedValue([]);

      const existing = makeIssue();
      mockIssueService.getById.mockResolvedValue(existing);
      mockIssueService.addComment.mockResolvedValue({
        id: "comment-3",
        issueId: existing.id,
        companyId: existing.companyId,
        body: canonicalizedBody,
      });

      const res = await request(await createApp())
        .post(`/api/issues/${existing.id}/comments`)
        .send({ body: staleBody });

      expect(res.status).toBe(201);

      // No mention-based wake for the stale agent ID
      const stamatWakes = mockHeartbeatService.wakeup.mock.calls.filter(
        ([agentId]: [string]) => agentId === STAMAT_AGENT_ID,
      );
      expect(stamatWakes).toHaveLength(0);
    });

    it("preserves correct Overlord mention and wakes Overlord", async () => {
      const body = `[@Overlord](agent://${OVERLORD_ID})`;

      // canonicalization keeps it as-is
      mockIssueService.canonicalizeCommentBody.mockResolvedValue(body);
      mockIssueService.findMentionedAgents.mockResolvedValue([OVERLORD_ID]);

      const existing = makeIssue();
      mockIssueService.getById.mockResolvedValue(existing);
      mockIssueService.addComment.mockResolvedValue({
        id: "comment-4",
        issueId: existing.id,
        companyId: existing.companyId,
        body,
      });

      const res = await request(await createApp())
        .post(`/api/issues/${existing.id}/comments`)
        .send({ body });

      expect(res.status).toBe(201);

      // Overlord should be woken
      await vi.waitFor(() => {
        const overlordWakes = mockHeartbeatService.wakeup.mock.calls.filter(
          ([agentId]: [string]) => agentId === OVERLORD_ID,
        );
        expect(overlordWakes).toHaveLength(1);
      });
    });
  });
});
