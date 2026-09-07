// @ts-nocheck -- Executes production callbacks with isolated native/hook boundaries.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys, getPostsFiltersFromKey } from "../src/api/read/query-keys";
import { getServerIdentity, StaleServerResponseError } from "../src/api/server-runtime";
import { assertReplyNotRejected, isReplyRejected, useReplyRejectionStore } from "../src/stores/reply-rejection-store";
import { isLegacyThreadReadOnlyError, LegacyThreadReadOnlyError } from "../src/domain/subscriptions/errors";

function loadCallbacks(path, name, dependencies) {
  const source = readFileSync(path, "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace(/^export \{[^}]*\} from [^;]*;/gm, "")
    .replace(/^export /gm, "");
  const compiled = new Bun.Transpiler({ loader: "tsx", tsconfig: { compilerOptions: { jsx: "react" } } }).transformSync(source);
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn ${name};`)(...Object.values(dependencies));
}

const error = { response: { data: { error_code: "legacy_thread_read_only" } } };

test("actual comment mutation rolls back counts and retains actual-parent rejection through refetch", async () => {
  const client = new QueryClient();
  const parentId = "runtime-nested";
  const rootId = "runtime-root";
  const key = [...queryKeys.commentsRoot(), "runtime"];
  const snapshot = { root: { post_id: rootId, comments: 7 }, children: [{ post_id: parentId, children: [] }] };
  client.setQueryData(key, snapshot);
  let calls = 0;
  const reports = [];
  const breadcrumbs = [];
  const useComment = loadCallbacks("src/api/write/hooks/use-post.ts", "useComment", {
    useQueryClient: () => client,
    useWallet: () => ({ getWallet: async () => ({}), address: null }),
    useMutation: (config) => config,
    mutationKeys: { post: { comment: () => ["test-mutation"] } },
    queryKeys, getPostsFiltersFromKey, getServerIdentity, StaleServerResponseError,
    assertReplyNotRejected, useReplyRejectionStore, isLegacyThreadReadOnlyError, LegacyThreadReadOnlyError,
    createComment: async () => { calls++; throw error; },
    Sentry: { captureException: (e) => reports.push(e), addBreadcrumb: (b) => breadcrumbs.push(b) },
    trackEvent: () => {},
  });
  const mutation = useComment();
  const input = { parentId, rootPostId: rootId, content: "draft", serverIdentity: getServerIdentity() };
  const context = await mutation.onMutate(input);
  expect(client.getQueryData(key).root.comments).toBe(8);
  await expect(mutation.mutationFn(input)).rejects.toBeInstanceOf(LegacyThreadReadOnlyError);
  mutation.onError(error, input, context);
  expect(client.getQueryData(key).root.comments).toBe(7);
  expect(reports).toEqual([]);
  expect(breadcrumbs).toHaveLength(1);
  await client.fetchQuery({ queryKey: key, queryFn: async () => snapshot, staleTime: 0 });
  expect(isReplyRejected(useReplyRejectionStore.getState(), getServerIdentity(), parentId)).toBe(true);
  expect(isReplyRejected(useReplyRejectionStore.getState(), getServerIdentity(), rootId)).toBe(false);
  await expect(mutation.mutationFn(input)).rejects.toThrow("read-only");
  expect(calls).toBe(1);
  mutation.onError(new Error("unexpected"), input, context);
  expect(reports).toHaveLength(1);
  await expect(mutation.mutationFn({ ...input, serverIdentity: "https://other.test" })).rejects.toBeInstanceOf(StaleServerResponseError);
  expect(isReplyRejected(useReplyRejectionStore.getState(), "https://other.test", parentId)).toBe(false);
});

test("actual composer queue rechecks before media upload and restores draft/media plus optimistic counts", async () => {
  let action;
  let uploads = 0;
  let mutations = 0;
  let visibleCount = 4;
  let cardCount = 4;
  let optimistic = 0;
  const drafts = [];
  const reports = [];
  const parentId = "composer-runtime-nested";
  const pending = { postId: "composer-runtime-root", replyToId: parentId, text: "my draft", imageUri: "file://image", gifUrl: "https://gif.test/a" };
  const composeState = {
    pendingComment: pending, wasDismissed: false, setWasDismissed: () => {},
    consumePendingComment: () => pending,
    saveDraft: (...args) => drafts.push(args),
  };
  const composeStore = Object.assign((selector) => selector(composeState), { getState: () => composeState });
  const component = loadCallbacks("src/pages/post/post-detail-comment-composer.tsx", "PostDetailCommentComposer", {
    forwardRef: (component) => component,
    useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}],
    useCallback: (fn) => fn, useEffect: (fn) => fn(), useImperativeHandle: () => {},
    React: { createElement: () => null, Fragment: "fragment" }, Text: "text", CommentInput: "input",
    useComment: () => ({ mutateAsync: async () => { mutations++; } }),
    usePowQueueStore: (selector) => selector({ enqueue: (next) => { action = next; next.onOptimisticUpdate(); } }),
    useCommentComposeStore: composeStore,
    useReplyRejectionStore: Object.assign((selector) => selector(useReplyRejectionStore.getState()), { getState: useReplyRejectionStore.getState }),
    isReplyRejected, assertReplyNotRejected, getServerIdentity, StaleServerResponseError,
    isLegacyThreadReadOnlyError, LEGACY_THREAD_NOTICE: "This older thread is read-only.",
    generateActionId: () => "action", getActionLabel: () => "Comment", markSeen: () => {},
    resolveCommentMediaUrl: async () => { uploads++; return "image"; },
    composeCommentContent: (text) => text,
    Sentry: { addBreadcrumb: () => {}, captureException: (e) => reports.push(e) },
  });
  component({
    id: pending.postId, currentUser: { id: "user" }, optimisticThreadId: pending.postId,
    baseCommentCount: 4, rootPostCommentCount: 4,
    addReplyOptimisticComment: () => optimistic++, addTopLevelOptimisticComment: () => optimistic++,
    removeOptimisticComment: () => optimistic--,
    incrementCommentCount: () => cardCount++, decrementCommentCount: () => cardCount--,
    onCommentCountDelta: (delta) => visibleCount += delta,
    onHighlightComment: () => {},
  }, null);
  expect(optimistic).toBe(1);
  expect(visibleCount).toBe(5);
  useReplyRejectionStore.getState().recordRejection(getServerIdentity(), parentId, error);
  let rejected;
  try { await action.execute(); } catch (e) { rejected = e; }
  expect(isLegacyThreadReadOnlyError(rejected)).toBe(true);
  expect(uploads).toBe(0);
  expect(mutations).toBe(0);
  action.onRollback();
  action.onError(rejected);
  expect(optimistic).toBe(0);
  expect(visibleCount).toBe(4);
  expect(cardCount).toBe(4);
  expect(drafts).toEqual([[pending.postId, parentId, { text: pending.text, imageUri: pending.imageUri, gifUrl: pending.gifUrl }]]);
  expect(reports).toEqual([]);
});
