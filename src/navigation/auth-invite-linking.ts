import { useEffect } from "react";
import * as Linking from "expo-linking";

export type AuthInviteLinkParams = {
  invite?: string;
  ref?: string;
};

export function formatInviteCode(value: string): string {
  const raw = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (raw.length > 4) {
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }
  return raw;
}

export function parseAuthInviteUrl(url: string): AuthInviteLinkParams | null {
  try {
    const parsedUrl = new URL(url);
    const invite = parsedUrl.searchParams.get("invite") ?? undefined;
    const ref = parsedUrl.searchParams.get("ref") ?? undefined;
    if (!invite && !ref) return null;
    return { invite, ref };
  } catch {
    return null;
  }
}

type AuthInviteLinkListenerOptions = {
  onInvite: (invite: string) => void;
  onReferral?: (ref: string) => void;
};

export function useAuthInviteLinkListener({
  onInvite,
  onReferral,
}: AuthInviteLinkListenerOptions): void {
  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      const params = parseAuthInviteUrl(event.url);
      if (!params) return;
      if (params.invite) {
        onInvite(params.invite);
        return;
      }
      if (params.ref) {
        onReferral?.(params.ref);
      }
    });

    return () => subscription.remove();
  }, [onInvite, onReferral]);
}
