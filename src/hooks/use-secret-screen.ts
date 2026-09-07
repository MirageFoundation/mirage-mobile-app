import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Keyboard } from "react-native";
import { acquireSecretScreen } from "@/src/services/secret-screen";

export function useSecretScreen() {
  const focused = useRef(false);
  const ready = useRef(false);
  const revealed = useRef(false);
  const [visible, setVisible] = useState(false);
  const [protection, setProtection] = useState<"checking" | "ready" | "unavailable">("checking");
  const conceal = useCallback(() => {
    revealed.current = false;
    setVisible(false);
    Keyboard.dismiss();
  }, []);
  const isVisible = useCallback(() => focused.current && ready.current && revealed.current && AppState.currentState === "active", []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    let active = true;
    let release: (() => Promise<void>) | undefined;
    setProtection("checking");
    void acquireSecretScreen().then((cleanup) => {
      if (!active) { void cleanup().catch(() => {}); return; }
      release = cleanup;
      ready.current = true;
      setProtection("ready");
    }).catch(() => { if (active) setProtection("unavailable"); });
    return () => {
      active = false;
      focused.current = false;
      ready.current = false;
      conceal();
      if (release) void release().catch(() => {});
    };
  }, [conceal]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") conceal();
    });
    return () => subscription.remove();
  }, [conceal]);
  const reveal = useCallback(() => {
    if (!focused.current || !ready.current || AppState.currentState !== "active") return;
    revealed.current = true;
    setVisible(true);
  }, []);
  return { visible, protection, reveal, conceal, isVisible };
}
