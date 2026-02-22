import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const LOCATION_TASK_NAME = "cscs-background-location-task";
const LOCATION_ENDPOINT =
  "https://system.celesteshoecleaningservices.com/api/location";
const ACCESS_TOKEN_KEY = "cscs-access-token";

const postLocation = async (
  location: Location.LocationObject,
  accessToken: string,
) => {
  const payload = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? undefined,
    speed: location.coords.speed ?? undefined,
    heading: location.coords.heading ?? undefined,
    altitude: location.coords.altitude ?? undefined,
    source: "mobile-webview",
    sentAt: new Date().toISOString(),
  };

  await fetch(LOCATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data) {
    return;
  }

  const accessToken = (await AsyncStorage.getItem(ACCESS_TOKEN_KEY)) || "";
  if (!accessToken) {
    return;
  }

  const { locations } = data as { locations?: Location.LocationObject[] };
  const latestLocation = locations?.[locations.length - 1];

  if (!latestLocation) {
    return;
  }

  try {
    await postLocation(latestLocation, accessToken);
  } catch {
    // Keep background task resilient when network is unavailable.
  }
});

export const persistAccessToken = async (token: string) => {
  if (token) {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
    return;
  }

  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
};

export const submitCurrentLocation = async (accessToken: string) => {
  if (!accessToken) {
    return false;
  }

  const foregroundPermission = await Location.getForegroundPermissionsAsync();
  if (foregroundPermission.status !== "granted") {
    const requestedPermission =
      await Location.requestForegroundPermissionsAsync();
    if (requestedPermission.status !== "granted") {
      return false;
    }
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  await postLocation(location, accessToken);
  return true;
};

export const startBackgroundLocationTracking = async () => {
  const foregroundPermission =
    await Location.requestForegroundPermissionsAsync();
  if (foregroundPermission.status !== "granted") {
    return false;
  }

  const backgroundPermission =
    await Location.requestBackgroundPermissionsAsync();
  if (backgroundPermission.status !== "granted") {
    return false;
  }

  const hasStarted =
    await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (hasStarted) {
    return true;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5000,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "CSCS Mobile Tracking",
      notificationBody: "Location tracking is active",
      killServiceOnDestroy: false,
    },
  });

  return true;
};

export const stopBackgroundLocationTracking = async () => {
  const hasStarted =
    await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

  if (!hasStarted) {
    return;
  }

  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
};
