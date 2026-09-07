import { useCallback, useRef, useState, type RefObject } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSharedValue } from "react-native-reanimated";

export function usePostDetailScroll({ currentScrollYRef }: { currentScrollYRef: RefObject<number> }) {
  const scrollY = useSharedValue(currentScrollYRef.current);
  const mediaBottom = useRef(Infinity);
  const [isVideoVisible, setIsVideoVisible] = useState(true);
  const handleMediaLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    mediaBottom.current = y + height;
    setIsVideoVisible(currentScrollYRef.current < mediaBottom.current);
  }, [currentScrollYRef]);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.y;
    currentScrollYRef.current = offset;
    setIsVideoVisible(offset < mediaBottom.current);
  }, [currentScrollYRef]);
  return { handleMediaLayout, handleScroll, isVideoVisible, scrollY };
}
