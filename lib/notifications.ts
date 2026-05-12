import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { authFetch, getToken } from "./api";

const API_BASE = "https://app.getvantro.com";

// Notification handler: suppress display for silent pushes (e.g. gps_ping_request)
// so installers don't see a buzzy notification banner every 15 min during their
// late-shift window. All other notifications display normally.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as any;
    const isSilent = !!data?.silent;
    return {
      shouldShowAlert: !isSilent,
      shouldShowBanner: !isSilent,
      shouldShowList: !isSilent,
      shouldPlaySound: !isSilent,
      shouldSetBadge: !isSilent,
    };
  },
});

// Received listener: fires when a push arrives while the app is in foreground
// or backgrounded. For gps_ping_request, fire a one-shot GPS read and POST it
// to /api/location so the admin gets a deliberate breadcrumb at the moment
// the cron asked.
Notifications.addNotificationReceivedListener(async (notification) => {
  try {
    const data = notification.request.content.data as any;
    if (data?.type !== "gps_ping_request") return;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      console.log("[ping] no location permission, skipping");
      return;
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const token = await getToken();
    if (!token) {
      console.log("[ping] no auth token, skipping");
      return;
    }

    const res = await fetch(API_BASE + "/api/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
      },
      body: JSON.stringify({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: Math.round(loc.coords.accuracy || 0),
      }),
    });

    if (res.ok) {
      console.log("[ping] gps reported successfully");
    } else {
      console.log("[ping] post failed", res.status);
    }
  } catch (e) {
    console.log("[ping] handler errored", e);
  }
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("vantro", {
      name: "Vantro",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00d4a0",
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: "1e578303-87f6-41d8-9abc-7b9f135f2ff0",
  })).data;

  return token;
}

export async function savePushToken(token: string) {
  await authFetch("/api/notifications/register", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
