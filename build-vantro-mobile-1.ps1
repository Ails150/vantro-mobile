New-Item -ItemType Directory -Force -Path C:\vantro-mobile | Out-Null
Set-Location C:\vantro-mobile

# ─── package.json ────────────────────────────────────────────
@'
{
  "name": "vantro-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-location": "~18.0.0",
    "expo-camera": "~16.0.0",
    "expo-image-picker": "~16.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-font": "~13.0.0",
    "react": "18.3.2",
    "react-native": "0.76.5",
    "react-native-maps": "1.18.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "@react-navigation/native": "^6.1.18",
    "@expo/vector-icons": "^14.0.0"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.3.12",
    "typescript": "^5.3.0"
  }
}
'@ | Set-Content "package.json" -Encoding UTF8

# ─── app.json ────────────────────────────────────────────────
@'
{
  "expo": {
    "name": "Vantro",
    "slug": "vantro",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "vantro",
    "userInterfaceStyle": "dark",
    "backgroundColor": "#0f1923",
    "splash": {
      "backgroundColor": "#0f1923"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.getvantro.app",
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Vantro needs your location to verify you are on site before signing in.",
        "NSCameraUsageDescription": "Vantro needs camera access to capture QA photos and defect evidence.",
        "NSPhotoLibraryUsageDescription": "Vantro needs photo library access to attach images to reports."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/icon.png",
        "backgroundColor": "#0f1923"
      },
      "package": "com.getvantro.app",
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Vantro needs your location to verify you are on site."
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "Vantro needs camera access for QA photos."
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
'@ | Set-Content "app.json" -Encoding UTF8

# ─── tsconfig.json ───────────────────────────────────────────
@'
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  }
}
'@ | Set-Content "tsconfig.json" -Encoding UTF8

# ─── babel.config.js ─────────────────────────────────────────
@'
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
'@ | Set-Content "babel.config.js" -Encoding UTF8

# ─── constants/api.ts ────────────────────────────────────────
New-Item -ItemType Directory -Force -Path constants | Out-Null
@'
export const API_BASE = 'https://app.getvantro.com';
'@ | Set-Content "constants/api.ts" -Encoding UTF8

Write-Host "Part 1 done - project config files created" -ForegroundColor Green
