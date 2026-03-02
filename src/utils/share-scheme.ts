let _scheme: string | null = null;
export const setShareScheme = (s: string) => {
  _scheme = s;
};
export const getShareScheme = () => _scheme;
