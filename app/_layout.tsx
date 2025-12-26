import { RootProvider } from "@/src/providers/root-provider";
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <RootProvider>
      <Stack />
    </RootProvider>
  );
}
