import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  completeInventorySession,
  findProductByBarcode,
  getOrCreateCurrentMonthSession,
  getSessionCounts,
  incrementProductCount,
  saveProductCount,
  searchProducts,
  type InventoryCountRow,
  type InventorySession,
  type Product,
} from "@/database/database";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";

type ScanMode = "scan" | "ocr" | "search";

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState<InventorySession | null>(null);
  const [items, setItems] = useState<InventoryCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("scan");
  const [zoom, setZoom] = useState(0);

  const [quantityItem, setQuantityItem] = useState<InventoryCountRow | null>(null);
  const [quantityInput, setQuantityInput] = useState("");
  const [savingQuantity, setSavingQuantity] = useState(false);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const scanLock = useRef(false);

  const locked = session?.status !== "in_progress";

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    try {
      setLoading(true);
      const activeSession = await getOrCreateCurrentMonthSession();
      setSession(activeSession);
      await refreshItems(activeSession.id);
    } catch (error) {
      console.error("Failed to load inventory session:", error);
      Alert.alert("Database Error", "Could not load the inventory session.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshItems(sessionId = session?.id) {
    if (!sessionId) return;

    const rows = await getSessionCounts(sessionId);

    const countedRows = rows
      .filter((row) => row.updatedAt !== null)
      .sort((a, b) => {
        const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return aTime - bTime;
      });

    setItems(countedRows);
  }

  async function handleRefresh() {
    if (!session) return;

    try {
      setRefreshing(true);
      await refreshItems(session.id);
    } catch (error) {
      console.error("Failed to refresh inventory:", error);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (
      scanMode !== "scan" ||
      locked ||
      !session ||
      scanLock.current
    ) {
      return;
    }

    scanLock.current = true;

    try {
      const barcode = data.trim();
      const foundProduct = await findProductByBarcode(barcode);

      if (!foundProduct) {
        Alert.alert(
          "Product Not Found",
          `No product is registered for barcode ${barcode}.`,
          [
            {
              text: "Search",
              onPress: () => {
                setSearchQuery(barcode);
                setSearchVisible(true);
              },
            },
            {
              text: "Scan Again",
              style: "cancel",
            },
          ],
        );

        return;
      }

      await incrementProductCount(session.id, foundProduct.id);
      await refreshItems(session.id);
    } catch (error) {
      console.error("Barcode processing failed:", error);
      Alert.alert("Error", "Could not save the scanned count.");
    } finally {
      setTimeout(() => {
        scanLock.current = false;
      }, 650);
    }
  }

  async function changeQuantity(item: InventoryCountRow, delta: number) {
    if (!session || locked) return;

    const nextQuantity = Math.max(0, item.quantity + delta);

    try {
      await saveProductCount(
        session.id,
        findProductIdFromItem(item),
        nextQuantity,
      );
      await refreshItems(session.id);
    } catch (error) {
      console.error("Failed to change quantity:", error);
      Alert.alert("Error", "Could not update the quantity.");
    }
  }

  function findProductIdFromItem(item: InventoryCountRow) {
    return productIdCache.get(item.barcode) ?? 0;
  }

  const productIdCache = new Map<string, number>();

  async function refreshItemsWithProductIds(sessionId: number) {
    const rows = await getSessionCounts(sessionId);
    return rows;
  }

  async function openQuantityEditor(item: InventoryCountRow) {
    if (locked) return;

    setQuantityItem(item);
    setQuantityInput(String(item.quantity));
  }

  async function saveEditedQuantity() {
    if (!session || !quantityItem || locked) return;

    const value = Number(quantityInput);

    if (!Number.isInteger(value) || value < 0) {
      Alert.alert("Invalid Quantity", "Enter a whole number greater than or equal to 0.");
      return;
    }

    try {
      setSavingQuantity(true);
      const product = await findProductByBarcode(quantityItem.barcode);

      if (!product) {
        throw new Error("Product no longer exists.");
      }

      await saveProductCount(session.id, product.id, value);
      await refreshItems(session.id);
      setQuantityItem(null);
    } catch (error) {
      console.error("Failed to save quantity:", error);
      Alert.alert("Error", "Could not save the quantity.");
    } finally {
      setSavingQuantity(false);
    }
  }

  async function openSearch() {
    setScanMode("search");
    setSearchVisible(true);
  }

  async function runSearch(query: string) {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const results = await searchProducts(query);
      setSearchResults(results);
    } catch (error) {
      console.error("Product search failed:", error);
      Alert.alert("Search Error", "Could not search products.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function addProductFromSearch(product: Product) {
    if (!session || locked) return;

    try {
      await incrementProductCount(session.id, product.id);
      await refreshItems(session.id);
      setSearchVisible(false);
      setSearchQuery("");
      setSearchResults([]);
      setScanMode("scan");
    } catch (error) {
      console.error("Failed to add product:", error);
      Alert.alert("Error", "Could not add the product.");
    }
  }

  function openOcr() {
    setScanMode("ocr");
    Alert.alert(
      "OCR",
      "OCR input is reserved for the next functional step. The scanner and manual search are ready now.",
      [
        {
          text: "Back to Scan",
          onPress: () => setScanMode("scan"),
        },
      ],
    );
  }

  async function handleCompleteInventory() {
    if (!session || locked) return;

    Alert.alert(
      "Complete Inventory",
      `Are you sure you want to complete the ${session.name} inventory?\n\nAfter completion, the inventory will be locked and cannot be changed.`,
      [
        { text: "Cancel", style: "cancel" },
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
            } catch (error) {
              console.error("Failed to complete inventory:", error);
              Alert.alert("Error", "Could not complete the inventory.");
            }
          },
        },
      ],
    );
  }

  function openMenu() {
    Alert.alert("Inventory Counter", "Choose an action", [
      { text: "Import Products", onPress: () => router.push("/import") },
      { text: "Archive", onPress: () => router.push("/archive") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function renderHeader() {
    return (
      <View>
        <View style={styles.cameraCard}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            active={scanMode === "scan" && !locked}
            zoom={zoom}
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
            onBarcodeScanned={
              scanMode === "scan" && !locked
                ? handleBarcodeScanned
                : undefined
            }
          />

          <View style={styles.cameraShade} />
          <View style={styles.scanFrame} />

          <View style={styles.zoomControl}>
            {[0, 0.5, 1].map((value, index) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.zoomButton,
                  zoom === value && styles.zoomButtonActive,
                ]}
                onPress={() => setZoom(value)}
              >
                <Text
                  style={[
                    styles.zoomText,
                    zoom === value && styles.zoomTextActive,
                  ]}
                >
                  {index === 0 ? "1x" : index === 1 ? "1.5x" : "2x"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, scanMode === "scan" && styles.modeButtonActive]}
            onPress={() => setScanMode("scan")}
            disabled={locked}
          >
            <Ionicons
              name="scan-outline"
              size={24}
              color={scanMode === "scan" ? "#70e884" : "#e7e7e7"}
            />
            <Text style={[styles.modeText, scanMode === "scan" && styles.modeTextActive]}>
              SCAN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeButton, scanMode === "ocr" && styles.modeButtonActive]}
            onPress={openOcr}
            disabled={locked}
          >
            <Ionicons name="scan-circle-outline" size={24} color="#e7e7e7" />
            <Text style={styles.modeText}>OCR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeButton, scanMode === "search" && styles.modeButtonActive]}
            onPress={openSearch}
            disabled={locked}
          >
            <Ionicons name="search-outline" size={24} color="#e7e7e7" />
            <Text style={styles.modeText}>SEARCH</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Items Added ({items.length})</Text>
          <Text style={styles.sectionHint}>Newest items appear below</Text>
        </View>
      </View>
    );
  }

  if (loading || !permission) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="light" />
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="light" />
        <Ionicons name="camera-outline" size={52} color="#70e884" />
        <Text style={styles.permissionTitle}>Camera Permission</Text>
        <Text style={styles.permissionText}>
          Camera access is required to scan product barcodes.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={openMenu}>
          <Ionicons name="menu-outline" size={27} color="#f5f5f5" />
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text style={styles.header}>INVENTORY COUNTER</Text>
          <Text style={styles.sessionName}>{session?.name}</Text>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push("/archive")}
          >
            <Ionicons name="calendar-outline" size={24} color="#f5f5f5" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={openMenu}>
            <Ionicons name="ellipsis-vertical" size={23} color="#f5f5f5" />
          </TouchableOpacity>
        </View>
      </View>

      {locked && (
        <View style={styles.lockedBanner}>
          <Ionicons name="lock-closed" size={14} color="#ff8b8b" />
          <Text style={styles.lockedText}>COMPLETED • LOCKED</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.barcode}
        renderItem={({ item, index }) => (
          <InventoryItemRow
            item={item}
            index={index}
            locked={locked}
            onDecrease={() => changeQuantity(item, -1)}
            onIncrease={() => changeQuantity(item, 1)}
            onSetQuantity={() => openQuantityEditor(item)}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={34} color="#4d4d4d" />
            <Text style={styles.emptyTitle}>No items counted yet</Text>
            <Text style={styles.emptyText}>
              Scan a barcode or use Search to add the first item.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {!locked && (
              <TouchableOpacity style={styles.manualButton} onPress={openSearch}>
                <Ionicons name="add" size={24} color="#071009" />
                <Text style={styles.manualButtonText}>ADD MANUALLY</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.completeButton, locked && styles.completeButtonDisabled]}
              onPress={handleCompleteInventory}
              disabled={locked}
            >
              <Ionicons
                name={locked ? "lock-closed-outline" : "checkmark-circle-outline"}
                size={21}
                color={locked ? "#686868" : "#f4f4f4"}
              />
              <Text style={[styles.completeButtonText, locked && styles.completeButtonTextDisabled]}>
                {locked ? "INVENTORY COMPLETED" : "COMPLETE INVENTORY"}
              </Text>
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#70e884"
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        visible={quantityItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setQuantityItem(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set Quantity</Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>
              {quantityItem?.productName || quantityItem?.barcode}
            </Text>

            <TextInput
              value={quantityInput}
              onChangeText={setQuantityInput}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
              style={styles.quantityInput}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setQuantityItem(null)}
                disabled={savingQuantity}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={saveEditedQuantity}
                disabled={savingQuantity}
              >
                <Text style={styles.modalSaveText}>
                  {savingQuantity ? "SAVING..." : "SAVE"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={searchVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSearchVisible(false);
          setScanMode("scan");
        }}
      >
        <KeyboardAvoidingView
          style={styles.searchBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.searchSheet}>
            <View style={styles.searchHeader}>
              <View>
                <Text style={styles.modalTitle}>Find Product</Text>
                <Text style={styles.modalSubtitle}>Code, name, or barcode</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setSearchVisible(false);
                  setScanMode("scan");
                }}
              >
                <Ionicons name="close" size={24} color="#f2f2f2" />
              </TouchableOpacity>
            </View>

            <TextInput
              value={searchQuery}
              onChangeText={runSearch}
              placeholder="Search products..."
              placeholderTextColor="#666"
              autoFocus
              style={styles.searchInput}
            />

            {searchLoading ? (
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>Searching...</Text>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.searchEmpty}>
                <Ionicons name="search-outline" size={30} color="#555" />
                <Text style={styles.searchEmptyText}>
                  {searchQuery ? "No matching products" : "Start typing to search"}
                </Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.searchResult}
                    onPress={() => addProductFromSearch(item)}
                  >
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName} numberOfLines={1}>
                        {item.productName}
                      </Text>
                      <Text style={styles.searchResultMeta}>
                        {item.productCode} • {item.barcode}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={24} color="#70e884" />
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090909",
  },
  center: {
    flex: 1,
    backgroundColor: "#090909",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#d8d8d8",
    fontSize: 17,
    marginTop: 12,
  },
  topBar: {
    minHeight: 68,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
  },
  header: {
    color: "#f4f4f4",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  sessionName: {
    color: "#777",
    fontSize: 12,
    marginTop: 3,
  },
  topActions: {
    flexDirection: "row",
  },
  lockedBanner: {
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#241616",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  lockedText: {
    color: "#ff8b8b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  listContent: {
    paddingBottom: 28,
  },
  cameraCard: {
    height: 315,
    marginHorizontal: 14,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#252525",
  },
  cameraShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  scanFrame: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "28%",
    height: "40%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
  },
  zoomControl: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  zoomButton: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
  },
  zoomButtonActive: {
    backgroundColor: "#17261b",
  },
  zoomText: {
    color: "#d8d8d8",
    fontSize: 13,
    fontWeight: "700",
  },
  zoomTextActive: {
    color: "#70e884",
  },
  modeRow: {
    marginHorizontal: 14,
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 13,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#242424",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  modeButtonActive: {
    backgroundColor: "#142219",
    borderColor: "#294d31",
  },
  modeText: {
    color: "#e7e7e7",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  modeTextActive: {
    color: "#70e884",
  },
  sectionHeader: {
    marginHorizontal: 14,
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#f5f5f5",
    fontSize: 20,
    fontWeight: "800",
  },
  sectionHint: {
    color: "#5d5d5d",
    fontSize: 11,
  },
  emptyState: {
    marginHorizontal: 14,
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#202020",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyTitle: {
    color: "#cfcfcf",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 9,
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
    fontSize: 13,
    marginTop: 5,
  },
  footer: {
    marginTop: 5,
    paddingHorizontal: 14,
  },
  manualButton: {
    minHeight: 56,
    borderRadius: 13,
    backgroundColor: "#45c65a",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  manualButtonText: {
    color: "#071009",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  completeButton: {
    minHeight: 52,
    marginTop: 10,
    borderRadius: 13,
    backgroundColor: "#242424",
    borderWidth: 1,
    borderColor: "#383838",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  completeButtonDisabled: {
    backgroundColor: "#171717",
    borderColor: "#242424",
  },
  completeButtonText: {
    color: "#f4f4f4",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  completeButtonTextDisabled: {
    color: "#686868",
  },
  permissionTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 15,
  },
  permissionText: {
    color: "#777",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 9,
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: "#45c65a",
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 11,
  },
  primaryButtonText: {
    color: "#071009",
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 20,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#303030",
  },
  modalTitle: {
    color: "#f5f5f5",
    fontSize: 20,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: "#777",
    fontSize: 13,
    marginTop: 5,
  },
  quantityInput: {
    marginTop: 18,
    height: 62,
    borderRadius: 12,
    backgroundColor: "#0d0d0d",
    borderWidth: 1,
    borderColor: "#303030",
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: "#282828",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: "#ddd",
    fontWeight: "800",
  },
  modalSave: {
    flex: 1,
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: "#45c65a",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSaveText: {
    color: "#071009",
    fontWeight: "900",
  },
  searchBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  searchSheet: {
    maxHeight: "88%",
    minHeight: "55%",
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 18,
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#202020",
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#303030",
    backgroundColor: "#191919",
    color: "#fff",
    paddingHorizontal: 15,
    fontSize: 16,
  },
  searchEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  searchEmptyText: {
    color: "#666",
    marginTop: 9,
  },
  searchResult: {
    minHeight: 70,
    marginTop: 8,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#292929",
    flexDirection: "row",
    alignItems: "center",
  },
  searchResultInfo: {
    flex: 1,
    minWidth: 0,
  },
  searchResultName: {
    color: "#f2f2f2",
    fontSize: 15,
    fontWeight: "700",
  },
  searchResultMeta: {
    color: "#777",
    fontSize: 12,
    marginTop: 5,
  },
});
