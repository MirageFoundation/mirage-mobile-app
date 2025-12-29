import { Box, Button, Text } from "@/src/components/ui/primitives";
import { useUIStore } from "@/src/stores";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export const AuthSheet = () => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const router = useRouter();
  const { theme } = useUnistyles();

  const authSheetVisible = useUIStore((s) => s.authSheetVisible);
  const hideAuthSheet = useUIStore((s) => s.hideAuthSheet);

  // Control sheet visibility based on store state
  useEffect(() => {
    if (authSheetVisible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [authSheetVisible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        hideAuthSheet();
      }
    },
    [hideAuthSheet]
  );

  const handleDismiss = useCallback(() => {
    hideAuthSheet();
  }, [hideAuthSheet]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleCreateAccount = () => {
    hideAuthSheet();
    router.push("/(auth)/username");
  };

  const handleLogin = () => {
    hideAuthSheet();
    router.push("/(auth)/login");
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      onChange={handleSheetChanges}
      onDismiss={handleDismiss}
      enablePanDownToClose
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      handleComponent={null}
      backgroundStyle={{
        backgroundColor: theme.colors.background.default,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
    >
      <BottomSheetView style={styles.container}>
        {/* Title */}
        <Text size="xl" weight="bold" style={styles.title}>
          Create an account to continue
        </Text>

        {/* Options */}
        <Box gap="md" style={{ paddingBottom: 40 }}>
          {/* Create Account */}
          <Button
            size="lg"
            rounded="lg"
            onPress={handleCreateAccount}
            style={styles.optionButton}
          >
            <Button.Icon>
              {({ color, size }) => (
                <Ionicons name="key" size={size} color={color} />
              )}
            </Button.Icon>
            <Box style={{ marginLeft: 12 }}>
              <Button.Text weight="semibold">Create New Account</Button.Text>
              <Text size="xs" inverse style={{ opacity: 0.8 }}>
                Set up your identity
              </Text>
            </Box>
          </Button>

          {/* Login */}
          <Button
            size="lg"
            variant="outline"
            rounded="lg"
            onPress={handleLogin}
            style={[styles.optionButton, styles.loginButton]}
          >
            <Button.Icon>
              {({ color, size }) => (
                <Ionicons name="document-text" size={size} color={color} />
              )}
            </Button.Icon>
            <Box style={{ marginLeft: 12 }}>
              <Button.Text weight="semibold">
                Login with Recovery Phrase
              </Button.Text>
              <Text size="xs" mode="subtle">
                I already have an account
              </Text>
            </Box>
          </Button>
        </Box>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  optionButton: {
    height: 72,
    justifyContent: "flex-start",
    paddingHorizontal: theme.spacing.md,
  },
  loginButton: {
    backgroundColor: theme.colors.background.subtle,
    borderWidth: 0.5,
    borderColor: theme.colors.border.default,
  },
}));
