import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Platform, Pressable, View, type GestureResponderEvent } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { StyleSheet } from "react-native-unistyles";

export type YouTubeAutoplayEmbedState =
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "buffering"
  | "unstarted"
  | "autoplayBlocked";

export type YouTubeAutoplayEmbedRef = {
  play: () => void;
  pause: () => void;
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => Promise<number>;
  getLastKnownTime: () => number;
  setMuted: (muted: boolean) => void;
};

type YouTubeAutoplayEmbedProps = {
  videoId: string;
  height: number;
  play: boolean;
  muted: boolean;
  autoplay?: boolean;
  controls?: boolean;
  loop?: boolean;
  allowFullscreen?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  onReady?: () => void;
  onPlaying?: () => void;
  onStateChange?: (state: YouTubeAutoplayEmbedState) => void;
  onTimeUpdate?: (seconds: number) => void;
};

const CUSTOM_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36";

function buildEmbedHTML({
  videoId,
  autoplay,
  controls,
  loop,
  allowFullscreen,
}: {
  videoId: string;
  autoplay: boolean;
  controls: boolean;
  loop: boolean;
  allowFullscreen: boolean;
}): string {
  const playlistPart = loop ? `&playlist=${videoId}` : "";
  const controlsValue = controls ? 1 : 0;
  const loopValue = loop ? 1 : 0;
  const fsValue = allowFullscreen ? 1 : 0;
  const autoplayValue = autoplay ? 1 : 0;

  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;overflow:hidden;background:#000}
html,body{height:100%;width:100%}
iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
html,body,iframe{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
</style>
</head>
<body>
<iframe
  id="ytplayer"
  src="https://www.youtube.com/embed/${videoId}?autoplay=${autoplayValue}&mute=1&playsinline=1&controls=${controlsValue}&loop=${loopValue}${playlistPart}&enablejsapi=1&rel=0&modestbranding=1&fs=${fsValue}&iv_load_policy=3&origin=https://localhost"
  allow="autoplay; encrypted-media; picture-in-picture"
  ${allowFullscreen ? "allowfullscreen" : "allowfullscreen=\"false\""}
  frameborder="0"
></iframe>
<script>
var player;
var AUTOPLAY_ENABLED = ${autoplay ? "true" : "false"};

function post(type){
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: type }));
}

function onYouTubeIframeAPIReady(){
  player = new YT.Player('ytplayer', {
    events: {
      onReady: function(e){
        e.target.mute();
        post('ready');
        if (AUTOPLAY_ENABLED) {
          e.target.playVideo();
        }
      },
      onStateChange: function(e){
        if (e.data === YT.PlayerState.PLAYING) {
          post('playing');
          startTimeReporter();
        }
        if (e.data === YT.PlayerState.PAUSED) post('paused');
        if (e.data === YT.PlayerState.ENDED) post('ended');
        if (e.data === YT.PlayerState.BUFFERING) post('buffering');
        if (e.data === YT.PlayerState.UNSTARTED) post('unstarted');
      },
      onAutoplayBlocked: function(){
        post('autoplayBlocked');
      }
    }
  });
}

var timeReporterInterval = null;
function startTimeReporter(){
  if (timeReporterInterval) clearInterval(timeReporterInterval);
  timeReporterInterval = setInterval(function(){
    if (player && player.getCurrentTime && player.getPlayerState && player.getPlayerState() === YT.PlayerState.PLAYING) {
      var t = player.getCurrentTime() || 0;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'timeUpdate', seconds: t }));
    } else {
      clearInterval(timeReporterInterval);
      timeReporterInterval = null;
    }
  }, 1000);
}

function handleAction(raw){
  try {
    var msg = JSON.parse(raw);
    if (!player) return;
    if (msg.action === 'play' && player.playVideo) player.playVideo();
    if (msg.action === 'pause' && player.pauseVideo) player.pauseVideo();
    if (msg.action === 'mute' && player.mute) player.mute();
    if (msg.action === 'unmute' && player.unMute) player.unMute();
    if (msg.action === 'seekBy' && player.seekTo && player.getCurrentTime) {
      var now = player.getCurrentTime() || 0;
      var next = now + (Number(msg.seconds) || 0);
      if (next < 0) next = 0;
      player.seekTo(next, true);
    }
    if (msg.action === 'seekTo' && player.seekTo) {
      player.seekTo(Number(msg.seconds) || 0, true);
    }
    if (msg.action === 'getCurrentTime' && player.getCurrentTime) {
      var t = player.getCurrentTime() || 0;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'currentTime', seconds: t, requestId: msg.requestId }));
    }
  } catch(err) {}
}

document.addEventListener('contextmenu', function(e){
  e.preventDefault();
  return false;
}, true);

document.addEventListener('selectstart', function(e){
  e.preventDefault();
  return false;
}, true);

document.addEventListener('message', function(e){
  handleAction(e.data);
});
window.addEventListener('message', function(e){
  handleAction(e.data);
});
</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body>
</html>`;
}

const YouTubeAutoplayEmbedInner = forwardRef<
  YouTubeAutoplayEmbedRef,
  YouTubeAutoplayEmbedProps
>(function YouTubeAutoplayEmbedInner(
  {
    videoId,
    height,
    play,
    muted,
    autoplay = false,
    controls = false,
    loop = true,
    allowFullscreen = false,
    onPress,
    onReady,
    onPlaying,
    onStateChange,
    onTimeUpdate,
  },
  ref,
) {
  const webViewRef = useRef<WebView | null>(null);
  const isReadyRef = useRef(false);
  const latestPlayRef = useRef(play);
  const latestMutedRef = useRef(muted);
  const currentTimeResolversRef = useRef<Map<string, (id: string, seconds: number) => void>>(new Map());
  const lastKnownTimeRef = useRef(0);

  const html = useMemo(
    () =>
      buildEmbedHTML({
        videoId,
        autoplay,
        controls,
        loop,
        allowFullscreen,
      }),
    [videoId, autoplay, controls, loop, allowFullscreen],
  );

  const postPlayerMessage = useCallback((payload: Record<string, unknown>) => {
    webViewRef.current?.postMessage(JSON.stringify(payload));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      play: () => postPlayerMessage({ action: "play" }),
      pause: () => postPlayerMessage({ action: "pause" }),
      seekBy: (seconds: number) => postPlayerMessage({ action: "seekBy", seconds }),
      seekTo: (seconds: number) => postPlayerMessage({ action: "seekTo", seconds }),
      getCurrentTime: () =>
        new Promise<number>((resolve) => {
          const requestId = String(Date.now()) + Math.random();
          const handler = (id: string, seconds: number) => {
            if (id === requestId) {
              currentTimeResolversRef.current.delete(requestId);
              resolve(seconds);
            }
          };
          currentTimeResolversRef.current.set(requestId, handler);
          postPlayerMessage({ action: "getCurrentTime", requestId });
          setTimeout(() => {
            if (currentTimeResolversRef.current.has(requestId)) {
              currentTimeResolversRef.current.delete(requestId);
              resolve(0);
            }
          }, 2000);
        }),
      getLastKnownTime: () => lastKnownTimeRef.current,
      setMuted: (nextMuted: boolean) => {
        postPlayerMessage({ action: nextMuted ? "mute" : "unmute" });
      },
    }),
    [postPlayerMessage],
  );

  useEffect(() => {
    latestPlayRef.current = play;
    if (!isReadyRef.current) return;
    postPlayerMessage({ action: play ? "play" : "pause" });
  }, [play, postPlayerMessage]);

  useEffect(() => {
    latestMutedRef.current = muted;
    if (!isReadyRef.current) return;
    postPlayerMessage({ action: muted ? "mute" : "unmute" });
  }, [muted, postPlayerMessage]);

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as { type?: YouTubeAutoplayEmbedState | "currentTime" | "timeUpdate"; seconds?: number; requestId?: string };
        if (!data.type) return;

        if (data.type === "currentTime" && data.requestId) {
          const resolver = currentTimeResolversRef.current.get(data.requestId);
          resolver?.(data.requestId, data.seconds ?? 0);
          return;
        }

        if (data.type === "timeUpdate" && typeof data.seconds === "number") {
          lastKnownTimeRef.current = data.seconds;
          onTimeUpdate?.(data.seconds);
          return;
        }

        if (data.type === "ready") {
          isReadyRef.current = true;
          onReady?.();
          postPlayerMessage({ action: latestMutedRef.current ? "mute" : "unmute" });
          postPlayerMessage({ action: latestPlayRef.current ? "play" : "pause" });
        }

        if (data.type === "playing") {
          onPlaying?.();
        }

        if (data.type !== "currentTime" && data.type !== "timeUpdate") {
          onStateChange?.(data.type);
        }

        if (data.type === "autoplayBlocked" && latestPlayRef.current) {
          setTimeout(() => {
            postPlayerMessage({ action: "play" });
          }, 300);
        }
      } catch {}
    },
    [onReady, onPlaying, onStateChange, onTimeUpdate, postPlayerMessage],
  );

  return (
    <View style={{ height, width: "100%", backgroundColor: "#000" }}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: "https://localhost" }}
        style={styles.webView}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        scrollEnabled={false}
        onMessage={handleWebMessage}
        userAgent={Platform.OS === "android" ? CUSTOM_USER_AGENT : undefined}
        allowsFullscreenVideo={allowFullscreen}
        mixedContentMode="always"
        setSupportMultipleWindows={false}
      />
      {onPress && <Pressable onPress={onPress} style={styles.overlay} />}
    </View>
  );
});

const styles = StyleSheet.create({
  webView: {
    flex: 1,
    backgroundColor: "transparent",
    opacity: 0.99,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
});

export const YouTubeAutoplayEmbed = memo(YouTubeAutoplayEmbedInner);
