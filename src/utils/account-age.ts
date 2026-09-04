const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 60 * 60 * 24;

export function calculateAccountAgeDays(
  createdAt: number | null | undefined,
  nowSeconds = Date.now() / 1000,
): number {
  if (!createdAt) return 0;
  return (nowSeconds - createdAt) / SECONDS_PER_DAY;
}

export function formatAccountAgeShort(days: number): string {
  const totalMinutes = days * 24 * 60;
  const totalHours = days * 24;

  if (totalMinutes < 1) {
    return "-";
  }

  if (totalHours < 1) {
    const minutes = Math.floor(totalMinutes);
    return `${minutes}min`;
  }

  if (days < 1) {
    const hours = Math.floor(totalHours);
    return `${hours}hr`;
  }

  if (days < 30) {
    const d = Math.floor(days);
    return `${d}d`;
  }

  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months}mo`;
  }

  const years = Math.floor(days / 365);
  return `${years}yr`;
}

export function formatAccountAgeLong(days: number): string {
  if (days < 1) {
    const hours = Math.floor(days * 24);
    if (hours < 1) return "< 1 hour";
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (days < 30) {
    const d = Math.floor(days);
    return `${d} day${d !== 1 ? "s" : ""}`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? "s" : ""}`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? "s" : ""}`;
}

export { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE };
