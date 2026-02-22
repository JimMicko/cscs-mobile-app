import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import {
  persistAccessToken,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  submitCurrentLocation,
} from "@/services/location-tracking";

const EMPLOYEE_PORTAL_URL =
  "https://system.celesteshoecleaningservices.com/employee";

const captureTokenScript = `
  (function () {
    var sendToken = function () {
      try {
        var token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auth-token', token: token }));
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auth-token', token: '' }));
      }
    };

    sendToken();
    setInterval(sendToken, 5000);
    window.addEventListener('storage', sendToken);
  })();
  true;
`;

export default function HomeScreen() {
  const [accessToken, setAccessToken] = useState("");
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const previousTokenRef = useRef("");
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    const syncTracking = async () => {
      await persistAccessToken(accessToken);

      if (!accessToken) {
        await stopBackgroundLocationTracking();
        previousTokenRef.current = "";
        return;
      }

      await startBackgroundLocationTracking();

      if (previousTokenRef.current !== accessToken) {
        try {
          await submitCurrentLocation(accessToken);
        } catch {
          // Keep UI flow uninterrupted if immediate submit fails.
        }
      }

      previousTokenRef.current = accessToken;
    };

    void syncTracking();
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLaunchScreen(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const submitOnInterval = async () => {
      if (isSubmittingRef.current) {
        return;
      }

      try {
        isSubmittingRef.current = true;
        await submitCurrentLocation(accessToken);
      } catch {
        // Keep retrying on next interval when network/location is unavailable.
      } finally {
        isSubmittingRef.current = false;
      }
    };

    const intervalId = setInterval(() => {
      void submitOnInterval();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [accessToken]);

  const handleWebViewMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        token?: string;
      };

      if (data.type === "auth-token") {
        setAccessToken(data.token ?? "");
      }
    } catch {
      // Ignore non-JSON messages from page scripts.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <WebView
        source={{ uri: EMPLOYEE_PORTAL_URL }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={captureTokenScript}
        onMessage={handleWebViewMessage}
        onLoadEnd={() => setShowLaunchScreen(false)}
        javaScriptEnabled
        domStorageEnabled
      />

      {showLaunchScreen ? (
        <View style={styles.launchScreen}>
          <Image
            source={require("@/assets/images/logo.png")}
            style={styles.logo}
          />
          <ActivityIndicator size="small" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  launchScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    backgroundColor: "#ffffff",
  },
  logo: {
    width: 230,
    height: 160,
    resizeMode: "contain",
  },
});
