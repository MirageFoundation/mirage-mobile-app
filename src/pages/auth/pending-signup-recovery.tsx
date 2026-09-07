import { useState } from "react";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { Alert, View } from "react-native";
import { RecoveryPhraseGrid } from "@/src/components/molecules";
import { Button, Text } from "@/src/components/ui/primitives";
import { useSecretScreen } from "@/src/hooks/use-secret-screen";
import { copySecretWithExpiry } from "@/src/services/secret-screen";
import { useAuthStore } from "@/src/stores/auth-store";

export function PendingSignupRecovery({ busy }: { busy: boolean }) {
  const phrase = useAuthStore((state) => state.recoveryPhrase);
  const protection = useSecretScreen();
  const [error, setError] = useState<string | null>(null);
  if (!phrase) return null;
  return (
    <View style={{ gap: 8 }}>
      <Button variant="ghost" disabled={busy || protection.protection !== "ready"} onPress={protection.visible ? protection.conceal : protection.reveal}>
        <Button.Text>{protection.visible ? "Hide recovery key" : "Back up retained recovery key"}</Button.Text>
      </Button>
      {protection.protection === "unavailable" && <Text size="sm">Screen protection unavailable. Your key remains hidden and retained on this device.</Text>}
      {protection.visible && <>
        <RecoveryPhraseGrid words={phrase.split(" ")} showCopyButton={false} />
        <Button variant="ghost" onPress={async () => {
          try { await copySecretWithExpiry(phrase, protection.isVisible); }
          catch { setError("Unable to copy. Write the phrase down offline instead."); }
        }}><Button.Text>Copy recovery key (clears after 30 seconds)</Button.Text></Button>
        <Text size="sm">Backing up this key does not confirm registration or sign you in.</Text>
      </>}
      {error && <Text size="sm" accessibilityRole="alert">{error}</Text>}
      <Button variant="ghost" disabled={busy} onPress={() => {
        const session = authSessionCoordinator.current();
        Alert.alert(
        "Permanently abandon signup?",
        "Registration may still complete and this wallet may receive funds. Save the recovery phrase first. This deletes the local key; without your backup the account and funds cannot be recovered.",
        [{ text: "Keep my key", style: "cancel" }, { text: "Delete local key", style: "destructive", onPress: () => {
          if (!authSessionCoordinator.isCurrent(session)) return;
          protection.conceal();
          void useAuthStore.getState().logout().catch(() => {});
        } }],
        );
      }}><Button.Text>Abandon signup...</Button.Text></Button>
    </View>
  );
}
