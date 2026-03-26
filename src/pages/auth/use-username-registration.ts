import { apiClient } from "@/src/api/client";
import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import { getReferralPrecheck } from "@/src/api/read/endpoints/referrals";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { validateInviteCode } from "@/src/api/read/endpoints/users";
import { useConfig, useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import { useUsernameAvailability } from "@/src/api/read/hooks/use-username-resolution";
import { queryKeys } from "@/src/api/read/query-keys";
import { setUsername as setUsernameOnChain } from "@/src/api/write";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  executeWithProgress,
  useServerList,
  useTransactionProgress,
} from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { useToast } from "@/src/providers/toast-provider";
import { walletService } from "@/src/services/wallet-service";
import { useAuthStore, usePreferencesStore, type ApiServer } from "@/src/stores";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "react-native";

import {
  type InviteCodeStatus,
  type ReferralPrecheckStatus,
  type UsernameStatus,
} from "./username-page-types";
import { useAuthServerBaseUrl } from "./use-auth-server-base-url";

export function useUsernameRegistration() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const createNewWallet = useAuthStore((s) => s.createNewWallet);
  const isCreatingWallet = useAuthStore((s) => s.isCreatingWallet);
  const setHasUsername = useAuthStore((s) => s.setHasUsername);
  const clearRecoveryPhrase = useAuthStore((s) => s.clearRecoveryPhrase);

  const searchParams = useLocalSearchParams<{ ref?: string; invite?: string }>();
  const savedServer = usePreferencesStore((s) => s.apiServer);
  const setApiServer = usePreferencesStore((s) => s.setApiServer);

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState<InviteCodeStatus>("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [referrerUsername, setReferrerUsername] = useState<string | null>(null);
  const [precheckStatus, setPrecheckStatus] =
    useState<ReferralPrecheckStatus>("idle");
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [precheckAvailable, setPrecheckAvailable] = useState<number | null>(null);
  const [alreadyUsedCode, setAlreadyUsedCode] = useState(false);
  const [activeServer, setActiveServer] = useState<ApiServer>(savedServer);
  const [showServerModal, setShowServerModal] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<ApiServer | null>(null);

  const walletConfirmedRef = useRef(false);
  const txProgress = useTransactionProgress();
  const { servers } = useServerList();

  useAuthServerBaseUrl(activeServer);

  const { data: config } = useConfig();
  const { data: nodeConfig } = useNodeConfig();
  const inviteCodeRequired = nodeConfig?.registration_invite_code_required ?? true;
  const minUsernameSize = config?.min_username_size ?? 3;
  const maxUsernameSize = config?.max_username_size ?? 20;
  const isReferralMode = precheckStatus === "valid" && !!referrerUsername;

  useEffect(() => {
    if (searchParams.invite) {
      const raw = searchParams.invite.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (raw.length > 4) {
        setInviteCode(raw.slice(0, 4) + "-" + raw.slice(4));
      } else {
        setInviteCode(raw);
      }
      return;
    }

    if (searchParams.ref && inviteCodeRequired) {
      const ref = searchParams.ref;
      setReferrerUsername(ref);
      setPrecheckStatus("loading");
      getReferralPrecheck({ username: ref })
        .then((result) => {
          if (result.valid) {
            setPrecheckStatus("valid");
            setPrecheckAvailable(result.available ?? null);
            return;
          }

          setPrecheckStatus("error");
          setPrecheckError(result.error ?? "Referral link is not valid");
          if (result.error === "you already used your code") {
            setAlreadyUsedCode(true);
          }
        })
        .catch(() => {
          setPrecheckStatus("error");
          setPrecheckError("Failed to verify referral link");
        });
    }
  }, [inviteCodeRequired, searchParams.invite, searchParams.ref]);

  const {
    data: usernameData,
    isLoading: isCheckingUsername,
    isFetched,
  } = useUsernameAvailability(
    username.length >= minUsernameSize ? username : null,
  );

  const validateUsername = useCallback(
    (value: string) => {
      if (value.length < minUsernameSize || value.length > maxUsernameSize) {
        return false;
      }
      return /^[a-zA-Z0-9-]+$/.test(value);
    },
    [maxUsernameSize, minUsernameSize],
  );

  useEffect(() => {
    if (username.length === 0) {
      setStatus("idle");
      return;
    }

    if (!validateUsername(username)) {
      setStatus("invalid");
      return;
    }

    if (isCheckingUsername) {
      setStatus("checking");
      return;
    }

    if (isFetched && usernameData) {
      setStatus(usernameData.exists ? "taken" : "available");
    }
  }, [isCheckingUsername, isFetched, username, usernameData, validateUsername]);

  const handleUsernameChange = useCallback((text: string) => {
    const sanitized = text.replace(/[^a-zA-Z0-9-]/g, "");
    setUsername(sanitized);
    setCreateError(null);
  }, []);

  const handleInviteCodeChange = useCallback((text: string) => {
    const raw = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length > 4) {
      setInviteCode(raw.slice(0, 4) + "-" + raw.slice(4));
    } else {
      setInviteCode(raw);
    }
    setInviteStatus("idle");
    setCreateError(null);
  }, []);

  const handleEnterManually = useCallback(() => {
    setReferrerUsername(null);
    setPrecheckStatus("idle");
    setPrecheckError(null);
    setPrecheckAvailable(null);
    setAlreadyUsedCode(false);
    setInviteCode("");
    setInviteStatus("idle");
  }, []);

  const handleContinue = useCallback(async () => {
    if (status !== "available") return;

    if (inviteCodeRequired && !isReferralMode && !inviteCode.trim()) {
      setInviteStatus("invalid");
      setCreateError("Please enter an invite code");
      triggerHaptic("error");
      return;
    }

    triggerHaptic("selection");
    Keyboard.dismiss();

    if (inviteCodeRequired && !isReferralMode) {
      setInviteStatus("checking");
    }

    try {
      if (inviteCodeRequired && !isReferralMode) {
        const rawCode = inviteCode.trim();
        const result = await validateInviteCode({ code: rawCode });

        if (!result.valid) {
          if (result.error === "already_used") {
            setInviteStatus("used");
          } else if (result.error === "expired") {
            setInviteStatus("expired");
          } else {
            setInviteStatus("invalid");
          }
          triggerHaptic("error");
          return;
        }

        setInviteStatus("valid");
      }

      setIsSettingUp(true);

      if (await walletService.hasWallet()) {
        await walletService.clearWallet();
      }

      const mnemonic = await createNewWallet();
      if (!mnemonic) {
        throw new Error("Failed to generate wallet");
      }

      const wallet = await walletService.getWallet();
      if (!wallet) {
        throw new Error("Wallet not available");
      }

      const txResult = await executeWithProgress(
        txProgress,
        async (onPoWProgress) => {
          txProgress.setPhase("signing");
          const usernamePayload = isReferralMode
            ? { username, referrer_username: referrerUsername! }
            : {
                username,
                ...(inviteCodeRequired && inviteCode.trim()
                  ? { invite_code: inviteCode.trim() }
                  : {}),
              };
          const response = await setUsernameOnChain(
            wallet,
            usernamePayload,
            onPoWProgress,
          );
          txProgress.setPhase("submitting");
          return response;
        },
        {
          pollTxStatus: true,
          getTxStatus: async (hash) => {
            const currentStatus = await getTxStatus({ hash });
            return {
              found: currentStatus.found,
              indexed: currentStatus.indexed ?? false,
              success: currentStatus.success,
              error_details: currentStatus.error_details,
            };
          },
        },
      );

      if (!txResult.success) {
        setIsSettingUp(false);
        setInviteStatus("idle");
        return;
      }

      setHasUsername(true, `anon-${username}`);
      triggerHaptic("success");

      setTimeout(() => {
        txProgress.hideModal();
        router.replace({
          pathname: "/(auth)/recovery-phrase",
          params: { username: `anon-${username}` },
        });
      }, 1500);
    } catch (error) {
      console.error("[Username] Failed to create account:", error);
      triggerHaptic("error");
      setIsSettingUp(false);
      setInviteStatus("idle");

      if (!txProgress.isVisible) {
        if (error instanceof Error) {
          if (error.message.includes("already exists")) {
            setCreateError("A wallet already exists. Please logout first.");
          } else {
            setCreateError("Failed to create account. Please try again.");
          }
        } else {
          setCreateError("An unexpected error occurred.");
        }
      }
    }
  }, [
    createNewWallet,
    inviteCode,
    inviteCodeRequired,
    isReferralMode,
    referrerUsername,
    router,
    setHasUsername,
    status,
    txProgress,
    username,
  ]);

  const handleRetry = useCallback(() => {
    txProgress.reset();
    setTimeout(() => {
      handleContinue();
    }, 100);
  }, [handleContinue, txProgress]);

  const handleDismissError = useCallback(async () => {
    txProgress.hideModal();
    setIsSettingUp(false);
    if (!walletConfirmedRef.current) {
      await walletService.clearWallet();
      clearRecoveryPhrase();
    }
  }, [clearRecoveryPhrase, txProgress]);

  const handleClose = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
    router.back();
  }, [router]);

  const handleLogin = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
    router.replace("/(auth)/login");
  }, [router]);

  const handleSwitchServer = useCallback(
    async (server: ApiServer) => {
      if (server === activeServer) {
        setShowServerModal(false);
        return;
      }

      setSwitchingServer(server);
      setActiveServer(server);
      apiClient.setBaseUrl(`https://${server}`);
      queryClient.removeQueries({ queryKey: queryKeys.nodeConfig() });
      queryClient.removeQueries({ queryKey: queryKeys.config() });
      queryClient.invalidateQueries({ queryKey: queryKeys.nodeConfig() });
      queryClient.invalidateQueries({ queryKey: queryKeys.config() });

      try {
        const freshNodeConfig = await getNodeConfig();
        if (!freshNodeConfig.registration_enabled) {
          setSwitchingServer(null);
          setShowServerModal(false);
          setApiServer(server);
          apiClient.setBaseUrl(`https://${server}`);
          toast.success(`Switched to ${server}`);
          router.back();
          return;
        }
        setApiServer(server);
        toast.success(`Switched to ${server}`);
      } catch (error) {
        console.error(
          "[UsernameScreen] Failed to fetch nodeConfig after switch:",
          error,
        );
        setActiveServer(activeServer);
        apiClient.setBaseUrl(`https://${activeServer}`);
        toast.error(`Failed to connect to ${server}`);
      }

      setSwitchingServer(null);
      setShowServerModal(false);
    },
    [activeServer, queryClient, router, setApiServer, toast],
  );

  const isButtonEnabled = useMemo(
    () =>
      status === "available" &&
      (inviteCodeRequired
        ? isReferralMode || inviteCode.trim().length > 0
        : true) &&
      !isCreatingWallet &&
      !isSettingUp &&
      inviteStatus !== "checking" &&
      precheckStatus !== "loading",
    [
      inviteCode,
      inviteCodeRequired,
      inviteStatus,
      isCreatingWallet,
      isReferralMode,
      isSettingUp,
      precheckStatus,
      status,
    ],
  );

  return {
    activeServer,
    alreadyUsedCode,
    createError,
    handleClose,
    handleContinue,
    handleDismissError,
    handleEnterManually,
    handleInviteCodeChange,
    handleLogin,
    handleRetry,
    handleSwitchServer,
    handleUsernameChange,
    inviteCode,
    inviteCodeRequired,
    inviteStatus,
    isButtonEnabled,
    isCreatingWallet,
    isReferralMode,
    isSettingUp,
    maxUsernameSize,
    minUsernameSize,
    precheckAvailable,
    precheckError,
    precheckStatus,
    setShowServerModal,
    showServerModal,
    servers,
    status,
    switchingServer,
    txProgress,
    username,
  };
}
