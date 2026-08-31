import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Public share-link alias. Web URLs are https://<host>/p/<id>, so this path
 * must keep resolving — but the canonical in-app screen is /post/[id].
 * Redirect (replace) so history never contains a duplicate post route.
 */
export default function PublicPostAlias() {
  const { id, ...params } = useLocalSearchParams<{ id: string }>();
  return (
    <Redirect
      href={{ pathname: "/post/[id]", params: { id, ...params } }}
    />
  );
}
