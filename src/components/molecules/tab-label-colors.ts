export function getTabLabelColors(textColors: {
  default: string;
  subtle: string;
}): { activeColor: string; inactiveColor: string } {
  return {
    activeColor: textColors.default,
    inactiveColor: textColors.subtle,
  };
}
