export const mutationKeys = {
  post: {
    create: () => ["write", "post", "create"] as const,
    createWithConfirmation: () => ["write", "post", "create-with-confirmation"] as const,
    comment: () => ["write", "post", "comment"] as const,
    commentWithConfirmation: () => ["write", "post", "comment-with-confirmation"] as const,
    edit: () => ["write", "post", "edit"] as const,
    delete: () => ["write", "post", "delete"] as const,
  },
  vote: {
    create: () => ["write", "vote"] as const,
    optimistic: () => ["write", "vote", "optimistic"] as const,
  },
  follow: {
    user: () => ["write", "follow", "user"] as const,
    unfollowUser: () => ["write", "follow", "unfollow-user"] as const,
    toggleUser: () => ["write", "follow", "toggle-user"] as const,
  },
  community: {
    join: () => ["write", "community", "join"] as const,
    leave: () => ["write", "community", "leave"] as const,
    toggle: () => ["write", "community", "toggle"] as const,
    block: () => ["write", "community", "block"] as const,
    unblock: () => ["write", "community", "unblock"] as const,
    setPreference: () => ["write", "community", "set-preference"] as const,
  },
  curation: {
    createTeam: () => ["write", "curation", "create-team"] as const,
    setTeamProfile: () => ["write", "curation", "set-team-profile"] as const,
    inviteCurator: () => ["write", "curation", "invite"] as const,
    revokeCuratorInvite: () => ["write", "curation", "revoke-invite"] as const,
    acceptCuratorInvite: () => ["write", "curation", "accept-invite"] as const,
    declineCuratorInvite: () => ["write", "curation", "decline-invite"] as const,
    leaveTeam: () => ["write", "curation", "leave-team"] as const,
    removeCurator: () => ["write", "curation", "remove-curator"] as const,
    transferTeam: () => ["write", "curation", "transfer-team"] as const,
    deleteTeam: () => ["write", "curation", "delete-team"] as const,
    setPostHidden: () => ["write", "curation", "set-post-hidden"] as const,
    setUserHidden: () => ["write", "curation", "set-user-hidden"] as const,
    setThreadLocked: () => ["write", "curation", "set-thread-locked"] as const,
    setSubscriberOnly: () => ["write", "curation", "set-subscriber-only"] as const,
    setTeamTag: () => ["write", "curation", "set-team-tag"] as const,
    setPostTag: () => ["write", "curation", "set-post-tag"] as const,
  },
  block: {
    user: () => ["write", "block", "user"] as const,
    unblockUser: () => ["write", "block", "unblock-user"] as const,
    post: () => ["write", "block", "post"] as const,
    unblockPost: () => ["write", "block", "unblock-post"] as const,
  },
  award: {
    give: () => ["write", "award", "give"] as const,
  },
  creatorEarnings: {
    claim: () => ["write", "creator-earnings", "claim"] as const,
  },
  report: {
    create: () => ["write", "report"] as const,
  },
  media: {
    upload: () => ["write", "media", "upload"] as const,
  },
  username: {
    set: () => ["write", "username", "set"] as const,
  },
  biography: {
    set: () => ["write", "biography", "set"] as const,
  },
  user: {
    delete: () => ["write", "user", "delete"] as const,
  },
  tokens: {
    send: () => ["write", "tokens", "send"] as const,
    upgradeLevel: () => ["write", "tokens", "upgrade-level"] as const,
    setAutoRenewal: () => ["write", "tokens", "set-auto-renewal"] as const,
    giftSubscription: () => ["write", "tokens", "gift-subscription"] as const,
  },
} as const;
