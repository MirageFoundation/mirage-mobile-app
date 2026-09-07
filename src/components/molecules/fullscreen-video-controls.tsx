import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";

export function FullscreenVideoControls({ playing, muted, position, duration, onPlayPause, onMute, onSeek }: {
  playing: boolean; muted: boolean; position: number; duration: number;
  onPlayPause: () => void; onMute: () => void; onSeek: (time: number) => void;
}) {
  const width = useRef(1);
  const seek = (x: number) => { if (duration > 0) onSeek(Math.max(0, Math.min(1, x / width.current)) * duration); };
  return (
    <View style={{ height: 64, width: "100%", backgroundColor: "#080808", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause video" : "Play video"} onPress={onPlayPause} style={{ padding: 12 }}>
        <Ionicons name={playing ? "pause" : "play"} size={24} color="#fff" />
      </Pressable>
      <View accessibilityRole="adjustable" accessibilityLabel="Video progress" accessibilityValue={{ min: 0, max: Math.max(0, duration), now: Math.min(position, duration) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => onSeek(Math.max(0, Math.min(duration, position + (nativeEvent.actionName === "increment" ? 10 : -10))))}
        onLayout={({ nativeEvent }) => { width.current = nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
        onResponderGrant={({ nativeEvent }) => seek(nativeEvent.locationX)} onResponderMove={({ nativeEvent }) => seek(nativeEvent.locationX)}
        style={{ flex: 1, height: 48, justifyContent: "center" }}>
        <View pointerEvents="none" style={{ height: 4, backgroundColor: "#666", borderRadius: 2 }}>
          <View style={{ height: 4, backgroundColor: "#fff", width: `${duration > 0 ? Math.min(100, position / duration * 100) : 0}%` }} />
        </View>
      </View>
      <Text style={{ color: "#fff", fontSize: 12 }}>{Math.floor(position)} / {Math.floor(duration)}s</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={muted ? "Unmute video" : "Mute video"} onPress={onMute} style={{ padding: 12 }}>
        <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color="#fff" />
      </Pressable>
    </View>
  );
}
