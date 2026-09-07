export type SideMenuAction =
  | "subscription"
  | "saved"
  | "history"
  | "following"
  | "communities"
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
        subtitle: "Users and communities you follow",
      },
      {
        action: "communities",
        iconName: "pricetags-outline",
        title: "Communities",
        subtitle: "Explore all communities",
      },
    ],
  },
  {
    title: "App",
    items: [
      {
        action: "subscription",
        iconName: "diamond-outline",
        title: "Perks",
        subtitle: "Update subscription",
        hideOnIos: true,
      },
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
  saved: "/saved-posts",
  history: "/history",
  communities: "/communities",
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

export function getJoinedCommunityDestination(community: string) {
  return `/c/${encodeURIComponent(community)}`;
}

export function getBalanceDestination() {
  return "/profile";
}

export function dismissThenNavigate(close: () => void, navigate: () => void) {
  close();
  navigate();
}
