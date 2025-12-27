import { useCallback, useMemo, useRef, useEffect } from "react";
import { View, Pressable } from "react-native";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Box, Text, Button } from "@/src/components/ui/primitives";
import { useUIStore } from "@/src/stores";

export const AuthSheet = () => {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const router = useRouter();
  const { theme } = useUnistyles();

  const authSheetVisible = useUIStore((s) => s.authSheetVisible);
  const hideAuthSheet = useUIStore((s) => s.hideAuthSheet);

  const snapPoints = useMemo(() => ["50%"], []);

  // Control sheet visibility based on store state
  useEffect(() => {
    if (authSheetVisible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
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

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
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

  const handleClose = () => {
    hideAuthSheet();
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: theme.colors.background.default,
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.border.default,
        width: 40,
      }}
    >
      <View style={styles.container}>
        {/* Close button */}
        <Pressable onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.colors.text.subtle} />
        </Pressable>

        {/* Title */}
        <Box center style={{ marginBottom: 32 }}>
          <Text size="xxl" weight="bold">
            Welcome to Mirage
          </Text>
        </Box>

        {/* Options */}
        <Box gap="md" px="md">
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
            style={styles.optionButton}
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
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  closeButton: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.md,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  optionButton: {
    height: 72,
    justifyContent: "flex-start",
    paddingHorizontal: theme.spacing.md,
  },
}));

