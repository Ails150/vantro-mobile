// Stub for react-native. Only Platform is used by the modules under test.
export const Platform = { OS: "android" as "android" | "ios" }
export function __setPlatform(os: "android" | "ios") { Platform.OS = os }
