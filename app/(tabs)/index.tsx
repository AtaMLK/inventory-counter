import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  completeInventorySession,
  findProductByBarcode,
  getOrCreateCurrentMonthSession,
  getProductCount,
  saveProductCount,
  type InventorySession,
  type Product,
} from "@/database/database";

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const [session, setSession] = useState<InventorySession | null>(null);

  const [scanned, setScanned] = useState(false);

  const [product, setProduct] = useState<Product | null>(null);

  const [count, setCount] = useState(0);

  const [showQuantityInput, setShowQuantityInput] = useState(false);

  const [quantityInput, setQuantityInput] = useState("");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    try {
      const activeSession = await getOrCreateCurrentMonthSession();

      setSession(activeSession);
    } catch (error) {
      console.error("Failed to load inventory session:", error);

      Alert.alert("Database Error", "Could not load the inventory session.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>Camera Permission</Text>

        <Text style={styles.permissionText}>
          Camera access is required to scan product barcodes.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={requestPermission}
        >
          <Text style={styles.primaryButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scanned || !session || session.status !== "in_progress") {
      return;
    }

    setScanned(true);

    try {
      const foundProduct = await findProductByBarcode(data);

      if (!foundProduct) {
        Alert.alert("Product Not Found", `Barcode: ${data}`, [
          {
            text: "Scan Again",
            onPress: () => {
              setScanned(false);
            },
          },
        ]);

        return;
      }

      setProduct(foundProduct);

      const existingCount = await getProductCount(session.id, foundProduct.id);

      const newCount = existingCount + 1;

      await saveProductCount(session.id, foundProduct.id, newCount);

      setCount(newCount);
    } catch (error) {
      console.error("Barcode processing failed:", error);

      Alert.alert("Error", "Could not save the count.");

      setScanned(false);
    }
  }
  async function handleCompleteInventory() {
    if (!session) return;

    Alert.alert(
      "Complete Inventory",
      `Are you sure you want to complete the ${session.name} inventory?\n\nAfter completion, the inventory will be locked and cannot be changed.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Complete",
          style: "destructive",
          onPress: async () => {
            try {
              await completeInventorySession(session.id);

              setSession({
                ...session,
                status: "completed",
                finishedAt: new Date().toISOString(),
              });

              Alert.alert(
                "Inventory Completed",
                `${session.name} has been completed and locked.`,
              );
            } catch (error) {
              console.error("Failed to complete inventory:", error);

              Alert.alert("Error", "Could not complete the inventory.");
            }
          },
        },
      ],
    );
  }
  async function increaseCount() {
    if (!product || !session || session.status !== "in_progress") {
      return;
    }

    const newCount = count + 1;

    setCount(newCount);

    await saveProductCount(session.id, product.id, newCount);
  }

  async function decreaseCount() {
    if (!product || !session || session.status !== "in_progress") {
      return;
    }

    const newCount = Math.max(0, count - 1);

    setCount(newCount);

    await saveProductCount(session.id, product.id, newCount);
  }

  function openQuantityInput() {
    setQuantityInput(String(count));
    setShowQuantityInput(true);
  }

  async function saveQuantity() {
    if (!product || !session || session.status !== "in_progress") {
      return;
    }

    const value = Number(quantityInput);

    if (!Number.isInteger(value) || value < 0) {
      Alert.alert(
        "Invalid Quantity",
        "Please enter a whole number greater than or equal to 0.",
      );

      return;
    }

    setCount(value);

    await saveProductCount(session.id, product.id, value);

    setShowQuantityInput(false);
  }

  function scanAnotherProduct() {
    setProduct(null);
    setCount(0);
    setScanned(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Inventory Counter</Text>

      <Text style={styles.sessionName}>{session?.name}</Text>

      {session?.status === "completed" && (
        <Text style={styles.lockedText}>COMPLETED • LOCKED</Text>
      )}

      {!product ? (
        <>
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  "ean13",
                  "ean8",
                  "code128",
                  "code39",
                  "upc_a",
                  "upc_e",
                ],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            <View style={styles.scanFrame} />
          </View>

          <Text style={styles.instruction}>Scan a product barcode</Text>
          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={() => router.push("/import")}
          >
            <Text style={styles.scanAgainText}>Import Products</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={() => router.push("/archive")}
          >
            <Text style={styles.scanAgainText}>Archive</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.completeButton}
            onPress={handleCompleteInventory}
          >
            <Text style={styles.completeButtonText}>Complete Inventory</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.productScreen}>
          <Text style={styles.productLabel}>PRODUCT</Text>

          <Text style={styles.productCode}>{product.productCode}</Text>

          <Text style={styles.productName}>{product.productName}</Text>

          <Text style={styles.barcodeText}>{product.barcode}</Text>

          <View style={styles.countCard}>
            <Text style={styles.countLabel}>CURRENT COUNT</Text>

            <Text style={styles.count}>{count}</Text>

            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={decreaseCount}
              >
                <Text style={styles.counterButtonText}>−</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.counterButton}
                onPress={increaseCount}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.quantityButton}
              onPress={openQuantityInput}
            >
              <Text style={styles.quantityButtonText}>Set Quantity</Text>
            </TouchableOpacity>
          </View>

          {showQuantityInput && (
            <View style={styles.quantityContainer}>
              <Text style={styles.quantityTitle}>Enter Quantity</Text>

              <TextInput
                value={quantityInput}
                onChangeText={setQuantityInput}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
                style={styles.quantityInput}
              />

              <View style={styles.quantityActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowQuantityInput(false)}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={saveQuantity}
                >
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={scanAnotherProduct}
          >
            <Text style={styles.scanAgainText}>Scan Another Product</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    paddingTop: 65,
    paddingHorizontal: 20,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  loadingText: {
    color: "#111",
    fontSize: 18,
  },

  header: {
    color: "white",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },

  sessionName: {
    color: "#777",
    textAlign: "center",
    marginTop: 5,
    marginBottom: 25,
  },

  cameraContainer: {
    width: "100%",
    height: 420,
    overflow: "hidden",
    borderRadius: 20,
  },

  scanFrame: {
    position: "absolute",
    width: 280,
    height: 150,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 12,
    alignSelf: "center",
    top: 135,
  },

  instruction: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 25,
    fontSize: 16,
  },

  productScreen: {
    flex: 1,
    alignItems: "center",
  },

  productLabel: {
    color: "#777",
    fontSize: 13,
    letterSpacing: 2,
  },

  productCode: {
    color: "white",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 8,
  },

  productName: {
    color: "#aaa",
    fontSize: 18,
    marginTop: 5,
  },

  barcodeText: {
    color: "#555",
    fontSize: 13,
    marginTop: 8,
  },

  countCard: {
    width: "100%",
    backgroundColor: "#1c1c1c",
    borderRadius: 20,
    padding: 25,
    marginTop: 35,
    alignItems: "center",
  },

  countLabel: {
    color: "#777",
    fontSize: 12,
    letterSpacing: 2,
  },

  count: {
    color: "white",
    fontSize: 72,
    fontWeight: "800",
    marginVertical: 15,
  },

  counterRow: {
    flexDirection: "row",
    gap: 20,
  },

  counterButton: {
    width: 80,
    height: 60,
    borderRadius: 15,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },

  counterButtonText: {
    color: "white",
    fontSize: 32,
    fontWeight: "600",
  },

  quantityButton: {
    width: "100%",
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: "white",
    alignItems: "center",
  },

  quantityButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "700",
  },

  quantityContainer: {
    width: "100%",
    backgroundColor: "#222",
    borderRadius: 18,
    padding: 20,
    marginTop: 20,
  },

  quantityTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },

  quantityInput: {
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 24,
    textAlign: "center",
  },

  quantityActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#333",
    alignItems: "center",
  },

  cancelText: {
    color: "white",
    fontWeight: "600",
  },

  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "white",
    alignItems: "center",
  },

  saveText: {
    color: "#111",
    fontWeight: "700",
  },

  scanAgainButton: {
    width: "100%",
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#444",
    alignItems: "center",
  },

  scanAgainText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },

  permissionTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 10,
  },

  permissionText: {
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },

  primaryButton: {
    backgroundColor: "#111",
    paddingHorizontal: 25,
    paddingVertical: 14,
    borderRadius: 10,
  },

  primaryButtonText: {
    color: "white",
    fontWeight: "700",
  },

  completeButton: {
    width: "100%",
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#8b1e1e",
    alignItems: "center",
  },

  completeButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },

  lockedText: {
    color: "#d66",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
  },
});
