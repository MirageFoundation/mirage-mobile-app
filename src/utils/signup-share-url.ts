export function buildSignupShareUrl(
  baseUrl: string,
  params: { invite?: string | null; ref?: string | null },
): string | null {
  const invite = params.invite?.trim();
  if (invite) {
    return `${baseUrl}/signup?invite=${encodeURIComponent(invite)}`;
  }

  const ref = params.ref?.trim();
  if (ref) {
    return `${baseUrl}/signup?ref=${encodeURIComponent(ref)}`;
  }

  return null;
}

export function canShareSignupUrl(
  url: string | null | undefined,
  enabled = true,
): url is string {
  return Boolean(url) && enabled;
}

export async function copySignupShareUrl(
  url: string | null | undefined,
  enabled: boolean,
  copy: (value: string) => Promise<void>,
): Promise<"copied" | "skipped"> {
  if (!canShareSignupUrl(url, enabled)) return "skipped";
  await copy(url);
  return "copied";
}

export async function shareSignupShareUrl(
  url: string | null | undefined,
  enabled: boolean,
  share: (payload: { message: string; title: string }) => Promise<unknown>,
): Promise<"shared" | "skipped" | "dismissed"> {
  if (!canShareSignupUrl(url, enabled)) return "skipped";
  try {
    await share({ message: url, title: "Join Mirage" });
    return "shared";
  } catch {
    return "dismissed";
  }
}
