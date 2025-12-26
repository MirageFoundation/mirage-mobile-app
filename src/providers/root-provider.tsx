import React, { memo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

import { QueryProvider } from "./query-provider";
import { QueryClearProvider } from "./query-clear-provider";
import { ThemeContextProvider } from "./theme-context";
import { ThemeProvider } from "./theme-provider";

const CoreProviders = memo(({ children }: { children: React.ReactNode }) => (
  <ThemeContextProvider>
    <ThemeProvider>
        {children}
    </ThemeProvider>
  </ThemeContextProvider>
));
CoreProviders.displayName = "CoreProviders";

const AuthProviders = memo(({ children }: { children: React.ReactNode }) => (
    <QueryProvider>
      <QueryClearProvider>{children}</QueryClearProvider>
    </QueryProvider>
));
AuthProviders.displayName = "AuthProviders";



export const RootProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <CoreProviders>
          <KeyboardProvider>
            <AuthProviders>
              <BottomSheetModalProvider>
                {children}
              </BottomSheetModalProvider>
            </AuthProviders>
          </KeyboardProvider>
        </CoreProviders>
      </GestureHandlerRootView>
    );
  }
);
RootProvider.displayName = "RootProvider";
