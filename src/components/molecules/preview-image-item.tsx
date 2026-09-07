import { memo } from "react";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useMediaDismissGesture } from "./use-media-dismiss-gesture";
import Animated from "react-native-reanimated";
import { usePreviewZoomGesture } from "./use-preview-zoom-gesture";

export const PreviewImageItem = memo(function PreviewImageItem({ uri, width, height, onDismiss }: {
  onDismiss?: () => void;
  uri: string;
  width: number;
  height: number;
}) {
  const { composedGesture, animatedStyle, scale } = usePreviewZoomGesture(width, height);
  const dismiss = useMediaDismissGesture(onDismiss, scale);
  return (
    <GestureDetector gesture={Gesture.Simultaneous(composedGesture, dismiss.gesture)}>
      <Animated.View style={dismiss.style}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="contain" recyclingKey={uri} accessibilityLabel="Fullscreen post image" />
      </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
});
