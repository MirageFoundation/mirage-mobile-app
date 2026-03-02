import { Redirect, usePathname } from "expo-router";

export default function NotFoundScreen() {
  const pathname = usePathname();
  console.log("[+not-found] pathname:", pathname);
  return <Redirect href="/" />;
}
