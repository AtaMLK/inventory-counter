import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { InventoryCountRow } from "@/database/database";

type InventoryItemRowProps = {
  item: InventoryCountRow;
  index: number;
  locked: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onSetQuantity: () => void;
};

export function InventoryItemRow({
  item,
  index,
  locked,
  onDecrease,
  onIncrease,
  onSetQuantity,
}: InventoryItemRowProps) {
  const primaryLabel = item.productName || item.barcode;
  const secondaryLabel = item.productName ? item.barcode : item.productCode;

  return (
    <View style={styles.card}>
      <Text style={styles.index}>{index + 1}</Text>

      <TouchableOpacity
        style={styles.info}
        activeOpacity={0.75}
        onPress={onSetQuantity}
        disabled={locked}
      >
        <Text style={styles.name} numberOfLines={1}>
          {primaryLabel}
        </Text>
        <Text style={styles.secondary} numberOfLines={1}>
          {secondaryLabel}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.adjustButton}
        onPress={onDecrease}
        disabled={locked || item.quantity === 0}
        accessibilityLabel={`Decrease ${primaryLabel}`}
      >
        <Ionicons name="remove" size={20} color={locked || item.quantity === 0 ? "#4b4b4b" : "#f2f2f2"} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.quantity}
        onPress={onSetQuantity}
        disabled={locked}
      >
        <Text style={styles.quantityText}>{item.quantity}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.adjustButton, styles.increaseButton]}
        onPress={onIncrease}
        disabled={locked}
        accessibilityLabel={`Increase ${primaryLabel}`}
      >
        <Ionicons name="add" size={21} color={locked ? "#4b4b4b" : "#79e58b"} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#292929",
    backgroundColor: "#171717",
    flexDirection: "row",
    alignItems: "center",
  },
  index: {
    width: 28,
    color: "#7d7d7d",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 8,
  },
  name: {
    color: "#f5f5f5",
    fontSize: 16,
    fontWeight: "700",
  },
  secondary: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },
  adjustButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#303030",
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  increaseButton: {
    backgroundColor: "#18261b",
    borderColor: "#243a28",
  },
  quantity: {
    minWidth: 44,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityText: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "800",
  },
});
