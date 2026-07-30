export type VoteType = "like" | "dislike";

type VoteColors = {
  inactive: string;
  like: string;
  dislike: string;
};

export const getVoteColor = (
  type: VoteType,
  isActive: boolean,
  colors: VoteColors,
) => (isActive ? colors[type] : colors.inactive);
