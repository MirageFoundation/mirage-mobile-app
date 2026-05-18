import { BlurGradientBox, Box, Button, Icon, Text } from "@/primitives";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Alert, Dimensions, TouchableOpacity } from "react-native";

export type RouteCardProps = {
  id: string;
  name: string;
  balance: number;
  icon: keyof typeof Feather.glyphMap;
  color: "blue" | "green" | "purple" | "orange" | "pink" | "indigo";
  onPress?: () => void;
};

const colorGradients = {
  blue: ["#3B82F6", "#1D4ED8"] as const,
  green: ["#10B981", "#059669"] as const,
  purple: ["#8B5CF6", "#7C3AED"] as const,
  orange: ["#F59E0B", "#D97706"] as const,
  pink: ["#EC4899", "#DB2777"] as const,
  indigo: ["#6366F1", "#4F46E5"] as const,
};

export const RouteCard = ({
  id,
  name,
  balance,
  icon,
  color,
  onPress,
}: RouteCardProps) => {
  const absoluteBalance = Math.abs(balance);
  const [integer = "0", decimal = "00"] = absoluteBalance
    .toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .split(".");
  const formattedBalance = {
    integer: `${balance < 0 ? "-" : ""}${integer}`,
    decimal,
  };

  // Calculate card width based on screen width minus padding
  const screenWidth = Dimensions.get("window").width;
  const horizontalPadding = 26; // 16px on each side
  const cardWidth = screenWidth - horizontalPadding;

  // Mock route link - in real app this would be generated/fetched
  const routeLink = `https://pay.soljar.xyz/${name
    .toLowerCase()
    .replace(/\s+/g, "-")}`;

  const handleShare = () => {
    Alert.alert("Route link", routeLink);
  };

  const handleCreateInvoice = () => {
    Alert.alert("Coming soon", "Create invoice feature coming soon!");
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <BlurGradientBox rounded="xl" style={{ width: cardWidth }}>
        {/* Card Content */}
        <Box p="md" gap="sm">
          {/* Header with icon and info */}
          <Box direction="row" alignItems="center" gap="md" mb="sm">
            <Box
              rounded="full"
              center
              style={{ width: 46, height: 46, overflow: "hidden" }}
            >
              <LinearGradient
                colors={colorGradients[color]}
                style={{
                  width: 46,
                  height: 46,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 25,
                }}
              >
                <Icon icon={Feather} name={icon} size={22} color="white" />
              </LinearGradient>
            </Box>

            <Box flex>
              <Text size="xl" weight="bold" numberOfLines={2}>
                {name}
              </Text>
              <Text size="lg" weight="bold" mode="subtle">
                ${formattedBalance.integer}.{formattedBalance.decimal}
              </Text>
            </Box>
          </Box>

          {/* Route Link Container */}
          <Box p="sm" rounded="md">
            <Text size="sm" mode="subtle" numberOfLines={1}>
              {routeLink}
            </Text>
          </Box>
        </Box>

        {/* Footer with action buttons */}
        <Box direction="row" gap="sm" pl="md" pr="md" pb="md">
          <Box flex>
            <Button
              mode="subtle"
              size="md"
              rounded="full"
              onPress={handleShare}
              style={{ width: "100%" }}
            >
              <Button.Icon style={{ marginRight: 5 }}>
                {(props) => <Icon {...props} icon={Feather} name="share" />}
              </Button.Icon>
              <Button.Text weight="bold">Share</Button.Text>
            </Button>
          </Box>

          <Box flex>
            <Button
              size="md"
              rounded="full"
              onPress={handleCreateInvoice}
              style={{ width: "100%" }}
            >
              <Button.Icon style={{ marginRight: 5 }}>
                {(props) => <Icon {...props} icon={Feather} name="plus" />}
              </Button.Icon>
              <Button.Text weight="bold">Invoice</Button.Text>
            </Button>
          </Box>
        </Box>
      </BlurGradientBox>
    </TouchableOpacity>
  );
};
