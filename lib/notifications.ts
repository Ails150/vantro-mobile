import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { authFetch } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
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