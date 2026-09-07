import type { Plan, PlanFeature } from "@/src/components/molecules/subscription";
import type { ModernTierConfig, ModernTiers } from "@/src/domain/subscriptions";
import { UMIRAGE_PER_MIRAGE } from "@/src/domain/subscriptions";
import { formatCompactNumber } from "@/src/utils/format-number";

const TIER_UI = [
  { id: "free", title: "Free", color: "#6B7280", icon: "person-outline" },
  { id: "subscriber", title: "Subscriber", color: "#F59E0B", icon: "shield-checkmark-outline" },
] as const;

const fmt = (n: number) => n.toLocaleString();

function buildShortFeatures(tier: ModernTierConfig, isFree: boolean): PlanFeature[] {
  const features: PlanFeature[] = [];
  if (isFree) {
    features.push({ text: "PoW for transactions" });
  } else {
    features.push({
      text: `${fmt(tier.max_daily_relays)} transactions per day without PoW`,
    });
  }
  features.push({ text: `Up to ${fmt(tier.max_content_length)} characters` });
  features.push({
    text: `Join up to ${fmt(tier.max_joined_communities)} communities and follow ${fmt(tier.max_followed_users)} users`,
  });
  if (tier.can_have_avatar || tier.can_have_biography) {
    const parts: string[] = [];
    if (tier.can_have_biography) parts.push("biography");
    if (tier.can_have_avatar) parts.push("avatar");
    if (tier.can_have_banner) parts.push("banner");
    features.push({ text: `Profile ${parts.join(", ")}` });
  }
  return features;
}

function buildFullFeatures(tier: ModernTierConfig, isFree: boolean, costLabel: string): PlanFeature[] {
  const features: PlanFeature[] = [];
  if (isFree) {
    features.push({ text: "Free tier. No MIRAGE needed to keep this plan active." });
  } else {
    features.push({ text: `Subscription cost: ${costLabel}.` });
    features.push({ text: `Daily no-PoW allowance: ${fmt(tier.max_daily_relays)}.` });
  }
  features.push({ text: `Follow up to ${fmt(tier.max_followed_users)} users.` });
  features.push({ text: `Join up to ${fmt(tier.max_joined_communities)} communities.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_users)} users.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_posts)} posts.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_communities)} communities.` });
  features.push({ text: `Post content up to ${fmt(tier.max_content_length)} characters.` });
  features.push({ text: `Vote weight: ${tier.vote_weight.toFixed(2)}x.` });
  if (isFree) {
    features.push({ text: "Uses proof-of-work (PoW) for posts and votes." });
  } else {
    features.push({ text: "No PoW required for posts or votes while subscribed and under quota." });
  }
  return features;
}

export function buildPurchasablePlans(tiers: ModernTiers, periodCount: number): Plan[] {
  return TIER_UI.map((ui, index) => {
    const tier = tiers[index];
    const isFree = Number(tier.period_fee) === 0;
    const periodFeeMirage = Math.round(Number(tier.period_fee) / UMIRAGE_PER_MIRAGE);
    const totalMirage = periodFeeMirage * periodCount;
    const costLabel = isFree
      ? "Free"
      : periodCount === 1
        ? `${formatCompactNumber(periodFeeMirage)} MIRAGE / period`
        : `${formatCompactNumber(totalMirage)} MIRAGE for ${periodCount} periods`;
    return {
      id: ui.id,
      title: ui.title,
      color: ui.color,
      icon: ui.icon,
      cost: costLabel,
      costValue: totalMirage,
      shortFeatures: buildShortFeatures(tier, isFree),
      fullFeatures: buildFullFeatures(tier, isFree, costLabel),
    };
  });
}

export function currentPlanIdFromKind(kind: string): string {
  if (kind === "subscriber") return "subscriber";
  return "free";
}
