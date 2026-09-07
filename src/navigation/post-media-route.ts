export function postMediaRoute(postId: string, index: number, syncContext?: string, revealed = false) {
  return {
    pathname: "/post-media/[id]" as const,
    params: { id: postId, index: String(index), fromDetail: "true", reveal: String(revealed), ...(syncContext ? { syncContext } : {}) },
  };
}

export function mediaRouteIndex(index: string | undefined, count: number): number {
  const parsed = Number(index ?? 0);
  return Number.isInteger(parsed) ? Math.max(0, Math.min(parsed, Math.max(0, count - 1))) : 0;
}

export function postMediaReturnRoute(postId: string) {
  return `/post/${encodeURIComponent(postId)}` as const;
}
