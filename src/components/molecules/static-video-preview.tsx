import { Platform, type StyleProp, type ViewStyle } from "react-native";
import { VideoView } from "expo-video";

import { useVideoPlayerController } from "@/src/hooks/use-video-player-controller";

type StaticVideoPreviewProps = {
  uri: string;
  style: StyleProp<ViewStyle>;
};

export function StaticVideoPreview({ uri, style }: StaticVideoPreviewProps) {
  const player = useVideoPlayerController(uri, { muted: true, bufferProfile: "feedWarm" });

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      surfaceType={Platform.OS === "android" ? "textureView" : undefined}
    />
  );
}
