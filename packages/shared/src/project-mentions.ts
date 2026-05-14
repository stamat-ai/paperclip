export const PROJECT_MENTION_SCHEME = "project://";
export const AGENT_MENTION_SCHEME = "agent://";
export const USER_MENTION_SCHEME = "user://";
export const SKILL_MENTION_SCHEME = "skill://";

const HEX_COLOR_RE = /^[0-9a-f]{6}$/i;
const HEX_COLOR_SHORT_RE = /^[0-9a-f]{3}$/i;
const HEX_COLOR_WITH_HASH_RE = /^#[0-9a-f]{6}$/i;
const HEX_COLOR_SHORT_WITH_HASH_RE = /^#[0-9a-f]{3}$/i;
const PROJECT_MENTION_LINK_RE = /\[[^\]]*]\((project:\/\/[^)\s]+)\)/gi;
const AGENT_MENTION_LINK_RE = /\[[^\]]*]\((agent:\/\/[^)\s]+)\)/gi;
const USER_MENTION_LINK_RE = /\[[^\]]*]\((user:\/\/[^)\s]+)\)/gi;
const SKILL_MENTION_LINK_RE = /\[[^\]]*]\((skill:\/\/[^)\s]+)\)/gi;
const AGENT_MENTION_LINK_WITH_LABEL_RE = /\[@([^\]]*)\]\((agent:\/\/[^)\s]+)\)/g;
const AGENT_ICON_NAME_RE = /^[a-z0-9-]+$/i;
const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

export interface ParsedProjectMention {
  projectId: string;
  color: string | null;
}

export interface ParsedAgentMention {
  agentId: string;
  icon: string | null;
}

export interface ParsedUserMention {
  userId: string;
}

export interface ParsedSkillMention {
  skillId: string;
  slug: string | null;
}

function normalizeHexColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (HEX_COLOR_WITH_HASH_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (HEX_COLOR_RE.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  if (HEX_COLOR_SHORT_WITH_HASH_RE.test(trimmed)) {
    const raw = trimmed.slice(1).toLowerCase();
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (HEX_COLOR_SHORT_RE.test(trimmed)) {
    const raw = trimmed.toLowerCase();
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return null;
}

export function buildProjectMentionHref(projectId: string, color?: string | null): string {
  const trimmedProjectId = projectId.trim();
  const normalizedColor = normalizeHexColor(color ?? null);
  if (!normalizedColor) {
    return `${PROJECT_MENTION_SCHEME}${trimmedProjectId}`;
  }
  return `${PROJECT_MENTION_SCHEME}${trimmedProjectId}?c=${encodeURIComponent(normalizedColor.slice(1))}`;
}

export function parseProjectMentionHref(href: string): ParsedProjectMention | null {
  if (!href.startsWith(PROJECT_MENTION_SCHEME)) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "project:") return null;

  const projectId = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").trim();
  if (!projectId) return null;

  const color = normalizeHexColor(url.searchParams.get("c") ?? url.searchParams.get("color"));

  return {
    projectId,
    color,
  };
}

export function buildAgentMentionHref(agentId: string, icon?: string | null): string {
  const trimmedAgentId = agentId.trim();
  const normalizedIcon = normalizeAgentIcon(icon ?? null);
  if (!normalizedIcon) {
    return `${AGENT_MENTION_SCHEME}${trimmedAgentId}`;
  }
  return `${AGENT_MENTION_SCHEME}${trimmedAgentId}?i=${encodeURIComponent(normalizedIcon)}`;
}

export function parseAgentMentionHref(href: string): ParsedAgentMention | null {
  if (!href.startsWith(AGENT_MENTION_SCHEME)) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "agent:") return null;

  const agentId = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").trim();
  if (!agentId) return null;

  return {
    agentId,
    icon: normalizeAgentIcon(url.searchParams.get("i") ?? url.searchParams.get("icon")),
  };
}

export function buildUserMentionHref(userId: string): string {
  return `${USER_MENTION_SCHEME}${userId.trim()}`;
}

export function parseUserMentionHref(href: string): ParsedUserMention | null {
  if (!href.startsWith(USER_MENTION_SCHEME)) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "user:") return null;

  const userId = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").trim();
  if (!userId) return null;

  return { userId };
}

export function buildSkillMentionHref(skillId: string, slug?: string | null): string {
  const trimmedSkillId = skillId.trim();
  const normalizedSlug = normalizeSkillSlug(slug ?? null);
  if (!normalizedSlug) {
    return `${SKILL_MENTION_SCHEME}${trimmedSkillId}`;
  }
  return `${SKILL_MENTION_SCHEME}${trimmedSkillId}?s=${encodeURIComponent(normalizedSlug)}`;
}

export function parseSkillMentionHref(href: string): ParsedSkillMention | null {
  if (!href.startsWith(SKILL_MENTION_SCHEME)) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "skill:") return null;

  const skillId = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").trim();
  if (!skillId) return null;

  return {
    skillId,
    slug: normalizeSkillSlug(url.searchParams.get("s") ?? url.searchParams.get("slug")),
  };
}

export function extractProjectMentionIds(markdown: string): string[] {
  if (!markdown) return [];
  const ids = new Set<string>();
  const re = new RegExp(PROJECT_MENTION_LINK_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const parsed = parseProjectMentionHref(match[1]);
    if (parsed) ids.add(parsed.projectId);
  }
  return [...ids];
}

export function extractAgentMentionIds(markdown: string): string[] {
  if (!markdown) return [];
  const ids = new Set<string>();
  const re = new RegExp(AGENT_MENTION_LINK_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const parsed = parseAgentMentionHref(match[1]);
    if (parsed) ids.add(parsed.agentId);
  }
  return [...ids];
}

export function extractUserMentionIds(markdown: string): string[] {
  if (!markdown) return [];
  const ids = new Set<string>();
  const re = new RegExp(USER_MENTION_LINK_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const parsed = parseUserMentionHref(match[1]);
    if (parsed) ids.add(parsed.userId);
  }
  return [...ids];
}

export function extractSkillMentionIds(markdown: string): string[] {
  if (!markdown) return [];
  const ids = new Set<string>();
  const re = new RegExp(SKILL_MENTION_LINK_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const parsed = parseSkillMentionHref(match[1]);
    if (parsed) ids.add(parsed.skillId);
  }
  return [...ids];
}

function normalizeAgentIcon(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || !AGENT_ICON_NAME_RE.test(trimmed)) return null;
  return trimmed;
}

function normalizeSkillSlug(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || !SKILL_SLUG_RE.test(trimmed)) return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Agent mention link canonicalization
// ---------------------------------------------------------------------------

export interface AgentDirectoryEntry {
  id: string;
  name: string;
  status: string;
}

export interface UserDirectoryEntry {
  userId: string;
  name: string;
}

export interface MentionDirectory {
  agents: AgentDirectoryEntry[];
  users: UserDirectoryEntry[];
}

function isActiveAgent(entry: AgentDirectoryEntry): boolean {
  return entry.status !== "terminated";
}

function labelMatchesAgent(label: string, agent: AgentDirectoryEntry): boolean {
  const l = label.toLowerCase();
  const name = agent.name.toLowerCase();
  if (l === name) return true;
  // Name-Role suffix form: e.g. "Stamat-CTO" matches agent named "Stamat"
  if (l.includes("-")) {
    const prefix = l.slice(0, l.lastIndexOf("-"));
    if (prefix === name) return true;
  }
  // Name (Role) suffix form: e.g. "Stamat (CTO)" matches agent named "Stamat"
  const parenMatch = l.match(/^(.+?)\s*\(.*\)$/);
  if (parenMatch && parenMatch[1] === name) return true;
  return false;
}

function resolveLabel(
  label: string,
  directory: MentionDirectory,
): { type: "agent"; agent: AgentDirectoryEntry } | { type: "user"; user: UserDirectoryEntry } | null {
  const activeAgents = directory.agents.filter(isActiveAgent);

  // Exact or suffix match against agents
  const agentMatches = activeAgents.filter((a) => labelMatchesAgent(label, a));
  if (agentMatches.length === 1) return { type: "agent", agent: agentMatches[0] };

  // Exact match against users
  const l = label.toLowerCase();
  const userMatches = directory.users.filter((u) => u.name.toLowerCase() === l);
  if (userMatches.length === 1) return { type: "user", user: userMatches[0] };

  return null;
}

/**
 * Rewrites `[@Label](agent://id)` links in markdown so label and href agree.
 *
 * Returns the canonicalized markdown. The directory must include all active
 * agents and board/company users so the function can resolve labels.
 */
export function canonicalizeAgentMentionLinks(markdown: string, directory: MentionDirectory): string {
  if (!markdown) return markdown;
  const re = new RegExp(AGENT_MENTION_LINK_WITH_LABEL_RE);
  return markdown.replace(re, (fullMatch, label: string, href: string) => {
    const parsed = parseAgentMentionHref(href);
    if (!parsed) return fullMatch;

    const hrefAgentId = parsed.agentId;
    const resolved = resolveLabel(label, directory);

    if (resolved?.type === "agent") {
      // Rule 1/3: label resolved to an active agent — use that agent's canonical form
      return `[@${resolved.agent.name}](${buildAgentMentionHref(resolved.agent.id)})`;
    }

    if (resolved?.type === "user") {
      // Rule 2: label resolved to a user — rewrite to user://
      return `[@${resolved.user.name}](${buildUserMentionHref(resolved.user.userId)})`;
    }

    // No unique resolution from the label. Check if the href target agent exists
    // and the label is compatible with it (rule 3).
    const hrefAgent = directory.agents.find((a) => a.id === hrefAgentId);
    if (hrefAgent && isActiveAgent(hrefAgent) && labelMatchesAgent(label, hrefAgent)) {
      return `[@${hrefAgent.name}](${buildAgentMentionHref(hrefAgent.id)})`;
    }

    // Rule 4: unknown, ambiguous, or incompatible — strip href, make inert
    return `@${label}`;
  });
}
