import { describe, expect, it } from "vitest";
import {
  buildAgentMentionHref,
  buildProjectMentionHref,
  buildSkillMentionHref,
  buildUserMentionHref,
  canonicalizeAgentMentionLinks,
  extractAgentMentionIds,
  extractProjectMentionIds,
  extractSkillMentionIds,
  extractUserMentionIds,
  parseAgentMentionHref,
  parseProjectMentionHref,
  parseSkillMentionHref,
  parseUserMentionHref,
  type MentionDirectory,
} from "./project-mentions.js";

describe("project-mentions", () => {
  it("round-trips project mentions with color metadata", () => {
    const href = buildProjectMentionHref("project-123", "#336699");
    expect(parseProjectMentionHref(href)).toEqual({
      projectId: "project-123",
      color: "#336699",
    });
    expect(extractProjectMentionIds(`[@Paperclip App](${href})`)).toEqual(["project-123"]);
  });

  it("round-trips agent mentions with icon metadata", () => {
    const href = buildAgentMentionHref("agent-123", "code");
    expect(parseAgentMentionHref(href)).toEqual({
      agentId: "agent-123",
      icon: "code",
    });
    expect(extractAgentMentionIds(`[@CodexCoder](${href})`)).toEqual(["agent-123"]);
  });

  it("round-trips user mentions", () => {
    const href = buildUserMentionHref("user-123");
    expect(parseUserMentionHref(href)).toEqual({
      userId: "user-123",
    });
    expect(extractUserMentionIds(`[@Taylor](${href})`)).toEqual(["user-123"]);
  });

  it("round-trips skill mentions with slug metadata", () => {
    const href = buildSkillMentionHref("skill-123", "release-changelog");
    expect(parseSkillMentionHref(href)).toEqual({
      skillId: "skill-123",
      slug: "release-changelog",
    });
    expect(extractSkillMentionIds(`[/release-changelog](${href})`)).toEqual(["skill-123"]);
  });
});

describe("canonicalizeAgentMentionLinks", () => {
  const OVERLORD_ID = "5772a3a1-4c7e-4da0-9e18-72b327db736c";
  const STAMAT_AGENT_ID = "aaaa-bbbb-cccc-dddd";
  const NORMA_AGENT_ID = "1111-2222-3333-4444";
  const TODOR_USER_ID = "user-todor-1";

  const directory: MentionDirectory = {
    agents: [
      { id: OVERLORD_ID, name: "Overlord", status: "active" },
      { id: STAMAT_AGENT_ID, name: "Stamat", status: "active" },
      { id: NORMA_AGENT_ID, name: "Norma", status: "active" },
      { id: "dead-agent-id", name: "DeadBot", status: "terminated" },
    ],
    users: [
      { userId: TODOR_USER_ID, name: "Todor" },
    ],
  };

  it("preserves correct Overlord mention", () => {
    const input = `[@Overlord](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe(`[@Overlord](agent://${OVERLORD_ID})`);
    expect(extractAgentMentionIds(result)).toEqual([OVERLORD_ID]);
  });

  it("rewrites @Todor with Overlord agent:// href to user://", () => {
    const input = `[@Todor](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe(`[@Todor](user://${TODOR_USER_ID})`);
    expect(extractAgentMentionIds(result)).toEqual([]);
  });

  it("strips href for unknown label with valid agent:// id", () => {
    const input = `[@SomeRandomName](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe("@SomeRandomName");
    expect(extractAgentMentionIds(result)).toEqual([]);
  });

  it("rewrites label to canonical agent when label matches a different agent", () => {
    const input = `[@Stamat](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe(`[@Stamat](agent://${STAMAT_AGENT_ID})`);
    expect(extractAgentMentionIds(result)).toEqual([STAMAT_AGENT_ID]);
  });

  it("handles Stamat-CTO suffix form", () => {
    const input = `[@Stamat-CTO](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe(`[@Stamat](agent://${STAMAT_AGENT_ID})`);
    expect(extractAgentMentionIds(result)).toEqual([STAMAT_AGENT_ID]);
  });

  it("handles Name (Role) suffix form", () => {
    const input = `[@Norma (QA)](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe(`[@Norma](agent://${NORMA_AGENT_ID})`);
    expect(extractAgentMentionIds(result)).toEqual([NORMA_AGENT_ID]);
  });

  it("keeps correct agent mention with matching label and href", () => {
    const input = `[@Stamat](agent://${STAMAT_AGENT_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe(`[@Stamat](agent://${STAMAT_AGENT_ID})`);
  });

  it("strips href for ambiguous label", () => {
    const ambiguousDir: MentionDirectory = {
      agents: [
        { id: "a1", name: "Bot", status: "active" },
        { id: "a2", name: "Bot", status: "active" },
      ],
      users: [],
    };
    const input = `[@Bot](agent://some-unrelated-id)`;
    const result = canonicalizeAgentMentionLinks(input, ambiguousDir);
    expect(result).toBe("@Bot");
  });

  it("does not resolve terminated agent by label", () => {
    const input = `[@DeadBot](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toBe("@DeadBot");
  });

  it("leaves non-agent links untouched", () => {
    const input = `Check [docs](https://example.com) and [@Overlord](agent://${OVERLORD_ID})`;
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toContain("[docs](https://example.com)");
    expect(result).toContain(`[@Overlord](agent://${OVERLORD_ID})`);
  });

  it("handles multiple mentions in one body", () => {
    const input = [
      `[@Overlord](agent://${OVERLORD_ID})`,
      `[@Todor](agent://${OVERLORD_ID})`,
      `[@UnknownGuy](agent://${STAMAT_AGENT_ID})`,
    ].join(" and ");
    const result = canonicalizeAgentMentionLinks(input, directory);
    expect(result).toContain(`[@Overlord](agent://${OVERLORD_ID})`);
    expect(result).toContain(`[@Todor](user://${TODOR_USER_ID})`);
    expect(result).toContain("@UnknownGuy");
    expect(extractAgentMentionIds(result)).toEqual([OVERLORD_ID]);
  });

  it("handles empty and null-ish input", () => {
    expect(canonicalizeAgentMentionLinks("", directory)).toBe("");
  });

  it("passes through text with no agent links", () => {
    const input = "Just some plain text with @PlainMention";
    expect(canonicalizeAgentMentionLinks(input, directory)).toBe(input);
  });
});
