type PressLog = {
  name: string;
  postId?: string;
  meta?: Record<string, unknown>;
};

export function logPress({ name, postId, meta }: PressLog) {
  if (!__DEV__) return;
  if (meta) {
    console.log(`[press] ${name}`, { postId, ...meta });
    return;
  }
  console.log(`[press] ${name}`, postId ? { postId } : undefined);
}
