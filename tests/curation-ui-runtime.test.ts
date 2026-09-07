// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

describe("curation UI runtime", () => {
  test("registers public team routes and authenticated invitation inbox", () => {
    expect(source("app/(app)/c/[slug]/teams/index.tsx")).toContain("CommunityTeamsScreen");
    expect(source("app/(app)/c/[slug]/teams/[teamId].tsx")).toContain("CommunityTeamDetailScreen");
    expect(source("app/(app)/curation-invitations.tsx")).toContain("CurationInvitationsScreen");
    const routes = source("src/navigation/route-map.ts");
    expect(routes).toContain("/curation-invitations");
    expect(routes).toContain("/teams");
    expect(source("src/pages/community/community-feed-header.tsx")).toContain("CommunityFeedMenu");
    expect(source("src/pages/community/community-feed-menu.tsx")).toContain("onTeamsPress");
    expect(source("src/pages/community/community-lens-picker.tsx")).toContain("collectTeamListLensOptions");
    expect(source("src/pages/settings/settings-content.tsx")).toContain("/curation-invitations");
    expect(source("src/pages/profile/profile-about-tab.tsx")).toContain("/curation-invitations");
  });

  test("owner and curator controls plus post-tag empty/clear are reachable", () => {
    const owner = source("src/pages/curation/community-team-owner-controls.tsx");
    expect(owner).toContain("Edit team");
    expect(owner).toContain("Posting audience");
    expect(owner).toContain("Content tag");
    expect(owner).toContain("Advanced actions");
    const fields = source("src/pages/curation/team-detail-action-fields.tsx");
    expect(fields).toContain("Transfer ownership");
    expect(fields).toContain("Delete team");
    expect(source("src/pages/curation/community-team-members.tsx")).toContain("Invite curator");
    expect(source("src/pages/curation/team-detail-overview.tsx")).toContain("Leave team");
    const detail = source("src/pages/curation/community-team-detail-content.tsx");
    expect(detail).toContain("TeamDetailOverview");
    expect(source("src/pages/curation/team-detail-overview.tsx")).toContain("CommunityTeamHiddenLists");
    const menu = source("src/pages/curation/post-moderation-sheet.tsx");
    expect(menu).toContain("Hide post");
    expect(menu).toContain("Restore post");
    expect(menu).toContain("Lock thread");
    expect(menu).toContain("empty");
    expect(menu).toContain("clear");
    expect(source("src/pages/post/post-detail-sections.tsx")).toContain("getThreadReplyPolicy");
    expect(source("src/pages/curation/curation-invitations-content.tsx")).toContain("Accept");
    expect(source("src/pages/curation/curation-invitations-content.tsx")).toContain("Decline");
  });
});
