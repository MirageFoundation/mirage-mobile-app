export type SideMenuAction =
  | "subscription"
  | "invite"
  | "referrals"
  | "quests"
  | "saved"
  | "history"
  | "following"
  | "topics"
  | "agents"
  | "settings"
  | "help"
  | "about";

export type SideMenuItem = {
  action: SideMenuAction;
  iconName: string;
  title: string;
  subtitle: string;
  hideOnIos?: boolean;
};

export type SideMenuSection = {
  title: string;
  items: readonly SideMenuItem[];
};

export const SIDE_MENU_SECTIONS: readonly SideMenuSection[] = [
  {
    title: "Rewards & Plans",
    items: [
      {
        action: "subscription",
        iconName: "diamond-outline",
        title: "Perks",
        subtitle: "Update subscription",
        hideOnIos: true,
      },
      {
        action: "invite",
        iconName: "gift-outline",
        title: "Invite a Friend",
        subtitle: "Get rewards",
      },
      {
        action: "referrals",
        iconName: "people-outline",
        title: "Referrals",
        subtitle: "Share your link & track signups",
      },
      {
        action: "quests",
        iconName: "trophy-outline",
        title: "Daily Quests",
        subtitle: "Complete tasks for rewards",
      },
    ],
  },
  {
    title: "Content",
    items: [
      {
        action: "saved",
        iconName: "bookmark-outline",
        title: "Saved",
        subtitle: "Your bookmarked posts",
      },
      {
        action: "history",
        iconName: "time-outline",
        title: "History",
        subtitle: "Recently viewed",
      },
    ],
  },
  {
    title: "Social",
    items: [
      {
        action: "following",
        iconName: "people-outline",
        title: "Following",
        subtitle: "Users and topics you follow",
      },
      {
        action: "topics",
        iconName: "pricetags-outline",
        title: "Topics",
        subtitle: "Explore all topics",
      },
      {
        action: "agents",
        iconName: "shield-checkmark-outline",
        title: "Agents",
        subtitle: "Browse and enable agents",
      },
    ],
  },
  {
    title: "App",
    items: [
      {
        action: "settings",
        iconName: "settings-outline",
        title: "Settings",
        subtitle: "App preferences",
      },
      {
        action: "help",
        iconName: "help-circle-outline",
        title: "Help & Support",
        subtitle: "FAQs and contact",
      },
      {
        action: "about",
        iconName: "information-circle-outline",
        title: "About",
        subtitle: "App info and legal",
      },
    ],
  },
];

export type SideMenuNavigation = {
  push: (destination: string) => void;
  replace: (destination: string) => void;
};

type RouteDelegateOptions = {
  navigation: SideMenuNavigation;
  user?: {
    walletAddress?: string | null;
    username?: string | null;
  } | null;
  openExternal: (url: string) => void;
};

const STATIC_DESTINATIONS: Partial<Record<SideMenuAction, string>> = {
  subscription: "/subscription",
  invite: "/invite-and-earn",
  referrals: "/referrals",
  quests: "/quests",
  saved: "/saved-posts",
  history: "/history",
  topics: "/topics",
  agents: "/agents",
  settings: "/settings",
};

export function createSideMenuRouteDelegate({
  navigation,
  user,
  openExternal,
}: RouteDelegateOptions) {
  return (action: SideMenuAction) => {
    if (action === "help") {
      openExternal("https://mirage.foundation/faq");
      return;
    }
    if (action === "about") {
      openExternal("https://mirage.foundation");
      return;
    }
    if (action === "following") {
      const id = user?.walletAddress || user?.username;
      if (id) navigation.push(`/user-following/${id}`);
      return;
    }
    const destination = STATIC_DESTINATIONS[action];
    if (destination) navigation.push(destination);
  };
}

export function getFollowedUserDestination(address: string) {
  return `/user/${address}`;
}

export function getFollowedTopicDestination(topic: string) {
  return `/topic/${topic}`;
}
