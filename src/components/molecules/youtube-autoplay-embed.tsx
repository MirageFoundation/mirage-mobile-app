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
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from "react-native-webview";
import { StyleSheet } from "react-native-unistyles";

import {
  isValidYouTubeVideoId,
  isYouTubeBootstrapUrl,
  parseYouTubePlayerMessage,
  shouldAllowYouTubeNavigation,
  YOUTUBE_BRIDGE_CHANNEL,
  YOUTUBE_WEBVIEW_ORIGIN_WHITELIST,
} from "./youtube-autoplay-policy";

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
type ShouldStartLoadRequest = Parameters<
  NonNullable<WebViewProps["onShouldStartLoadWithRequest"]>
>[0];
type WebViewLoadEvent = Parameters<NonNullable<WebViewProps["onLoadEnd"]>>[0];

function createBridgeNonce(scope: string): string {
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  for (let index = 0; index < scope.length; index += 1) {
    values[index % values.length] ^= scope.charCodeAt(index) << ((index % 4) * 8);
  }
  return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
}

function buildEmbedHTML({
  videoId,
  bridgeNonce,
  autoplay,
  controls,
  loop,
  allowFullscreen,
}: {
  videoId: string;
  bridgeNonce: string;
  autoplay: boolean;
  controls: boolean;
  loop: boolean;
  allowFullscreen: boolean;
}): string {
  const safeVideoId = isValidYouTubeVideoId(videoId) ? videoId : "";
  const playlistPart = loop && safeVideoId ? `&playlist=${safeVideoId}` : "";
  const controlsValue = controls ? 1 : 0;
  const loopValue = loop ? 1 : 0;
  const fsValue = allowFullscreen ? 1 : 0;
  const autoplayValue = autoplay ? 1 : 0;
  const channelJSON = JSON.stringify(YOUTUBE_BRIDGE_CHANNEL);
  const nonceJSON = JSON.stringify(bridgeNonce);
  const playerSource = safeVideoId
    ? `https://www.youtube.com/embed/${safeVideoId}?autoplay=${autoplayValue}&mute=1&playsinline=1&controls=${controlsValue}&loop=${loopValue}${playlistPart}&enablejsapi=1&rel=0&modestbranding=1&fs=${fsValue}&iv_load_policy=3&origin=https://localhost`
    : "about:blank";

  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${bridgeNonce}' https://www.youtube.com; frame-src https://www.youtube.com; style-src 'unsafe-inline'">
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
  src="${playerSource}"
  allow="autoplay; encrypted-media${allowFullscreen ? "; fullscreen" : ""}"
  ${allowFullscreen ? "allowfullscreen" : ""}
  frameborder="0"
></iframe>
<script nonce="${bridgeNonce}">
var player;
var AUTOPLAY_ENABLED = ${autoplay ? "true" : "false"};
var BRIDGE_CHANNEL = ${channelJSON};
var BRIDGE_NONCE = ${nonceJSON};

function post(type, details){
  var message = { channel: BRIDGE_CHANNEL, nonce: BRIDGE_NONCE, type: type };
  if (details) {
    if (typeof details.seconds === 'number') message.seconds = details.seconds;
    if (typeof details.requestId === 'string') message.requestId = details.requestId;
  }
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
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
      post('timeUpdate', { seconds: t });
    } else {
      clearInterval(timeReporterInterval);
      timeReporterInterval = null;
    }
  }, 1000);
}

function handleAction(raw){
  try {
    var msg = JSON.parse(raw);
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (msg.channel !== BRIDGE_CHANNEL || msg.nonce !== BRIDGE_NONCE || typeof msg.action !== 'string') return;
    if (!player) return;
    var keys = Object.keys(msg).sort().join(',');
    if (keys === 'action,channel,nonce') {
      if (msg.action === 'play' && player.playVideo) player.playVideo();
      if (msg.action === 'pause' && player.pauseVideo) player.pauseVideo();
      if (msg.action === 'mute' && player.mute) player.mute();
      if (msg.action === 'unmute' && player.unMute) player.unMute();
      return;
    }
    if (typeof msg.seconds === 'number' && isFinite(msg.seconds) && msg.seconds >= -604800 && msg.seconds <= 604800 && keys === 'action,channel,nonce,seconds') {
      if (msg.action === 'seekBy' && player.seekTo && player.getCurrentTime) {
        var now = player.getCurrentTime() || 0;
        var next = now + msg.seconds;
        if (next < 0) next = 0;
        player.seekTo(next, true);
      }
      if (msg.action === 'seekTo' && player.seekTo) {
        player.seekTo(msg.seconds, true);
      }
      return;
    }
    if (msg.action === 'getCurrentTime' && typeof msg.requestId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(msg.requestId) && keys === 'action,channel,nonce,requestId' && player.getCurrentTime) {
      var t = player.getCurrentTime() || 0;
      post('currentTime', { seconds: t, requestId: msg.requestId });
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
<script nonce="${bridgeNonce}" src="https://www.youtube.com/iframe_api"></script>
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
  const requestIdRef = useRef(0);
  const bootstrapConsumedRef = useRef(false);
  const controlledDocumentLoadedRef = useRef(false);
  const bridgeNonce = useMemo(() => createBridgeNonce(videoId), [videoId]);

  const html = useMemo(
    () =>
      buildEmbedHTML({
        videoId,
        bridgeNonce,
        autoplay,
        controls,
        loop,
        allowFullscreen,
      }),
    [videoId, bridgeNonce, autoplay, controls, loop, allowFullscreen],
  );

  const postPlayerMessage = useCallback(
    (payload: Record<string, unknown>) => {
      webViewRef.current?.postMessage(
        JSON.stringify({ channel: YOUTUBE_BRIDGE_CHANNEL, nonce: bridgeNonce, ...payload }),
      );
    },
    [bridgeNonce],
  );

  useEffect(() => {
    bootstrapConsumedRef.current = false;
    controlledDocumentLoadedRef.current = false;
    isReadyRef.current = false;
    currentTimeResolversRef.current.clear();
  }, [html]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => postPlayerMessage({ action: "play" }),
      pause: () => postPlayerMessage({ action: "pause" }),
      seekBy: (seconds: number) => postPlayerMessage({ action: "seekBy", seconds }),
      seekTo: (seconds: number) => postPlayerMessage({ action: "seekTo", seconds }),
      getCurrentTime: () =>
        new Promise<number>((resolve) => {
          requestIdRef.current += 1;
          const requestId = `${Date.now()}-${requestIdRef.current}`;
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
      if (!controlledDocumentLoadedRef.current) return;

      const data = parseYouTubePlayerMessage(event.nativeEvent.data, bridgeNonce);
      if (!data) return;

      if (data.type === "currentTime") {
        const resolver = currentTimeResolversRef.current.get(data.requestId);
        resolver?.(data.requestId, data.seconds);
        return;
      }

      if (data.type === "timeUpdate") {
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

      onStateChange?.(data.type);

      if (data.type === "autoplayBlocked" && latestPlayRef.current) {
        setTimeout(() => {
          postPlayerMessage({ action: "play" });
        }, 300);
      }
    },
    [bridgeNonce, onReady, onPlaying, onStateChange, onTimeUpdate, postPlayerMessage],
  );

  const handleShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest) =>
      shouldAllowYouTubeNavigation(request, !bootstrapConsumedRef.current, videoId),
    [videoId],
  );

  const handleLoadStart = useCallback(() => {
    controlledDocumentLoadedRef.current = false;
  }, []);

  const handleLoadEnd = useCallback((event: WebViewLoadEvent) => {
    const isControlledDocument = isYouTubeBootstrapUrl(event.nativeEvent.url);
    controlledDocumentLoadedRef.current = isControlledDocument;
    if (isControlledDocument) bootstrapConsumedRef.current = true;
  }, []);

  return (
    <View style={{ height, width: "100%", backgroundColor: "#000" }}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: "https://localhost" }}
        style={styles.webView}
        originWhitelist={YOUTUBE_WEBVIEW_ORIGIN_WHITELIST}
        allowsInlineMediaPlayback
        allowsAirPlayForMediaPlayback={false}
        allowsPictureInPictureMediaPlayback={false}
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        domStorageEnabled={false}
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        useSharedProcessPool={false}
        cacheEnabled={false}
        incognito
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        geolocationEnabled={false}
        mediaCapturePermissionGrantType="deny"
        dataDetectorTypes="none"
        bounces={false}
        scrollEnabled={false}
        onMessage={handleWebMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        userAgent={Platform.OS === "android" ? CUSTOM_USER_AGENT : undefined}
        allowsFullscreenVideo={allowFullscreen}
        mixedContentMode="never"
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
