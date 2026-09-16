import { defineConfig } from "vitest/config"
import path from "path"

// Pure-logic tests only.
//
// The mobile repo had no test framework at all, so this is the lightest thing
// that can assert the security properties: vitest, with the two native modules
// these files touch stubbed. It deliberately does NOT try to render a screen --
// jest-expo and a full React Native transform chain would be needed for that,
// and the rules worth pinning here (what reaches Sentry, what the pins are, what
// happens on a rooted device) are all decidable without one.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "expo-device": path.resolve(__dirname, "__tests__/stubs/expo-device.ts"),
      "react-native": path.resolve(__dirname, "__tests__/stubs/react-native.ts"),
    },
  },
})
