import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { initializeDatabase } from "@/database/database";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [databaseReady, setDatabaseReady] = useState(false);

  useEffect(() => {
    initializeDatabase()
      .then(() => {
        setDatabaseReady(true);
      })
      .catch((error) => {
        console.error("Database initialization failed:", error);
      });
  }, []);

  if (!databaseReady) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="import"
          options={{
            title: "Import Products",
          }}
        />
        <Stack.Screen
          name="archive"
          options={{
            title: "Archive",
          }}
        />

        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Modal",
          }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
