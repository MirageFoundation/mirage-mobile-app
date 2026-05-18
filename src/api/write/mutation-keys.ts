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
    topic: () => ["write", "follow", "topic"] as const,
    unfollowTopic: () => ["write", "follow", "unfollow-topic"] as const,
    enableAgent: () => ["write", "follow", "enable-agent"] as const,
    disableAgent: () => ["write", "follow", "disable-agent"] as const,
    toggleTopic: () => ["write", "follow", "toggle-topic"] as const,
    toggleUser: () => ["write", "follow", "toggle-user"] as const,
  },
  block: {
    user: () => ["write", "block", "user"] as const,
    unblockUser: () => ["write", "block", "unblock-user"] as const,
    topic: () => ["write", "block", "topic"] as const,
    unblockTopic: () => ["write", "block", "unblock-topic"] as const,
    post: () => ["write", "block", "post"] as const,
    unblockPost: () => ["write", "block", "unblock-post"] as const,
  },
  award: {
    give: () => ["write", "award", "give"] as const,
  },
  annotate: {
    create: () => ["write", "annotate"] as const,
  },
  agents: {
    set: () => ["write", "agents", "set"] as const,
  },
  rewards: {
    claim: () => ["write", "rewards", "claim"] as const,
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
