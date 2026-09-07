import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { useIsFocused } from "expo-router/react-navigation";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";

type Phase = "idle" | "presenting" | "open" | "dismissing";

export function useTeamCreateSheetPresentation(visible: boolean, close: () => void) {
  const sheet = useRef<BottomSheetModal>(null);
  const phase = useRef<Phase>("idle");
  const focused = useIsFocused();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (visible && focused) {
      if (phase.current !== "idle" || !sheet.current) return;
      phase.current = "presenting";
      sheet.current.present();
    } else if (phase.current === "open") {
      // Never dismiss an idle or RAF-scheduled modal: Gorhom suppresses its portal.
      phase.current = "dismissing";
      Keyboard.dismiss();
      sheet.current?.dismiss();
    }
  }, [focused, revision, visible]);

  const onChange = useCallback((index: number) => {
    if (index < 0 || phase.current !== "presenting") return;
    phase.current = "open";
    setRevision((value) => value + 1);
  }, []);

  const onDismiss = useCallback(() => {
    if (phase.current === "idle") return;
    const controlled = phase.current === "dismissing";
    phase.current = "idle";
    // A new open request must wait for dismissal, not be cleared by the old one.
    if (!controlled || !focused) close();
    setRevision((value) => value + 1);
  }, [close, focused]);

  return { sheet, onChange, onDismiss, focused };
}
