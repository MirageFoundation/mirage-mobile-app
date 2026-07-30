export const CONTENT_WARNING_IDS = [
  "sensitive",
  "adult",
  "violence",
  "gore",
  "death",
] as const;

export type ContentWarningId = (typeof CONTENT_WARNING_IDS)[number];
export type ContentWarningType = ContentWarningId | "nsfw";
export type ContentWarningTone = "warning" | "error";

export type ContentWarningOption = {
  id: ContentWarningId;
  label: string;
  description: string;
  filterIcon: string;
  badgeIcon: string;
  badgeTone: ContentWarningTone;
};

export const CONTENT_WARNING_OPTIONS: readonly ContentWarningOption[] = [
  {
    id: "sensitive",
    label: "Sensitive",
    description: "Sensitive or potentially upsetting material",
    filterIcon: "warning-outline",
    badgeIcon: "alert-circle",
    badgeTone: "warning",
  },
  {
    id: "adult",
    label: "Adult",
    description: "Sexually explicit or adult material",
    filterIcon: "eye-off-outline",
    badgeIcon: "eye-off",
    badgeTone: "error",
  },
  {
    id: "violence",
    label: "Violence",
    description: "Violent acts or threats",
    filterIcon: "flash-outline",
    badgeIcon: "warning",
    badgeTone: "error",
  },
  {
    id: "gore",
    label: "Gore",
    description: "Graphic injury or gore",
    filterIcon: "skull-outline",
    badgeIcon: "skull",
    badgeTone: "error",
  },
  {
    id: "death",
    label: "Death",
    description: "Death or dying",
    filterIcon: "alert-circle-outline",
    badgeIcon: "skull-outline",
    badgeTone: "error",
  },
];

export const CONTENT_WARNING_CONFIG: Record<
  ContentWarningType,
  Pick<ContentWarningOption, "label" | "badgeIcon" | "badgeTone">
> = {
  ...Object.fromEntries(
    CONTENT_WARNING_OPTIONS.map(({ id, label, badgeIcon, badgeTone }) => [
      id,
      { label, badgeIcon, badgeTone },
    ]),
  ) as Record<
    ContentWarningId,
    Pick<ContentWarningOption, "label" | "badgeIcon" | "badgeTone">
  >,
  nsfw: {
    label: "NSFW",
    badgeIcon: "eye-off-outline",
    badgeTone: "error",
  },
};

export function isContentWarningId(value: string): value is ContentWarningId {
  return CONTENT_WARNING_IDS.includes(value as ContentWarningId);
}

export function getSingleContentWarningSelection(
  value: string,
): ContentWarningId[] {
  return isContentWarningId(value) ? [value] : [];
}

export function selectSingleContentWarning(
  _selectedIds: readonly ContentWarningId[],
  id: ContentWarningId,
): ContentWarningId[] {
  return [id];
}

export function clearContentWarningSelection(): ContentWarningId[] {
  return [];
}
