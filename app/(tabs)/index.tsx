import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type CameraView as CameraViewType } from "expo-camera";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
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
import { buildOcrCandidates, extractOcrTokens, recognizeImageText } from "@/database/ocr";

type ScanMode = "scan" | "ocr" | "search";

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState<InventorySession | null>(null);
  const [items, setItems] = useState<InventoryCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("scan");
  const [zoom, setZoom] = useState(0);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);

  const [quantityItem, setQuantityItem] = useState<InventoryCountRow | null>(null);
  const [quantityInput, setQuantityInput] = useState("");
  const [savingQuantity, setSavingQuantity] = useState(false);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrResults, setOcrResults] = useState<Product[]>([]);
  const [ocrVisible, setOcrVisible] = useState(false);

  const cameraRef = useRef<CameraViewType | null>(null);
  const scanLock = useRef(false);
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = session?.status !== "in_progress";

  useEffect(() => {
    void loadSession();
    return () => {
      if (cameraTimer.current) clearTimeout(cameraTimer.current);
    };
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
    setItems(
      rows
        .filter((row) => row.updatedAt !== null)
        .sort((a, b) => {
          const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
          const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
          return aTime - bTime;
        }),
    );
  }

  async function handleRefresh() {
    if (!session) return;
    try {
      setRefreshing(true);
      await refreshItems(session.id);
    } finally {
      setRefreshing(false);
    }
  }

  function restartCameraAfterScan() {
    if (cameraTimer.current) clearTimeout(cameraTimer.current);
    setCameraActive(false);
    cameraTimer.current = setTimeout(() => {
      setCameraReady(false);
      setCameraActive(true);
      cameraTimer.current = null;
    }, 500);
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scanMode !== "scan" || locked || !session || scanLock.current) return;
    scanLock.current = true;
    restartCameraAfterScan();

    try {
      const barcode = data.trim();
      const product = await findProductByBarcode(barcode);
      if (!product) {
        Alert.alert("Product Not Found", `No product is registered for barcode ${barcode}.`, [
          {
            text: "Search",
            onPress: () => {
              setSearchQuery(barcode);
              setSearchVisible(true);
              setScanMode("search");
              void runSearch(barcode);
            },
          },
          { text: "Scan Again", style: "cancel" },
        ]);
        return;
      }
      await incrementProductCount(session.id, product.id);
      await refreshItems(session.id);
    } catch (error) {
      console.error("Barcode processing failed:", error);
      Alert.alert("Error", "Could not save the scanned count.");
    } finally {
      setTimeout(() => {
        scanLock.current = false;
      }, 500);
    }
  }

  async function captureOcr() {
    if (!session || locked || ocrBusy || !cameraReady || !cameraRef.current) return;

    try {
      setOcrBusy(true);
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (!picture?.uri) throw new Error("Camera did not return an image.");

      const recognition = await recognizeImageText(picture.uri);
      const text = recognition.text?.trim() ?? "";
      setOcrText(text);

      if (!text) {
        setOcrResults([]);
        setOcrVisible(true);
        return;
      }

      const candidates = buildOcrCandidates(recognition);
      const tokens = extractOcrTokens(text);
      const searchTerms = [...tokens, ...candidates.map((candidate) => candidate.value)];
      const found = new Map<number, Product>();
      let exactProduct: Product | null = null;

      for (const token of searchTerms.slice(0, 35)) {
        const barcodeProduct = await findProductByBarcode(token);
        if (barcodeProduct) {
          exactProduct = barcodeProduct;
          found.set(barcodeProduct.id, barcodeProduct);
          break;
        }

        const matches = await searchProducts(token, 5);
        for (const product of matches) {
          found.set(product.id, product);
          if (product.productCode.trim().toUpperCase() === token.toUpperCase()) {
            exactProduct = product;
          }
        }
      }

      const results = [...found.values()].slice(0, 8);
      setOcrResults(results);

      // Auto-add only an exact barcode/product-code match. A fuzzy name match
      // is never silently counted because it could be the wrong part.
      if (exactProduct) {
        await incrementProductCount(session.id, exactProduct.id);
        await refreshItems(session.id);
        setOcrVisible(false);
        Alert.alert(
          "OCR Match",
          `${exactProduct.productCode} • ${exactProduct.productName}\n\nQuantity increased by 1.`,
          [{ text: "Ready for Next" }],
        );
      } else {
        setOcrVisible(true);
      }
    } catch (error) {
      console.error("OCR failed:", error);
      Alert.alert("OCR Error", "Could not read the text. Move closer, keep the label flat, and try again.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function addOcrProduct(product: Product) {
    if (!session || locked) return;
    try {
      await incrementProductCount(session.id, product.id);
      await refreshItems(session.id);
      setOcrVisible(false);
    } catch (error) {
      console.error("Failed to add OCR product:", error);
      Alert.alert("Error", "Could not add the product.");
    }
  }

  async function changeQuantity(item: InventoryCountRow, delta: number) {
    if (!session || locked) return;
    const nextQuantity = Math.max(0, item.quantity + delta);
    try {
      await saveProductCount(session.id, item.productId, nextQuantity);
      await refreshItems(session.id);
    } catch (error) {
      console.error("Failed to change quantity:", error);
      Alert.alert("Error", "Could not update the quantity.");
    }
  }

  function openQuantityEditor(item: InventoryCountRow) {
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
      await saveProductCount(session.id, quantityItem.productId, value);
      await refreshItems(session.id);
      setQuantityItem(null);
    } catch (error) {
      console.error("Failed to save quantity:", error);
      Alert.alert("Error", "Could not save the quantity.");
    } finally {
      setSavingQuantity(false);
    }
  }

  function openSearch() {
    setScanMode("search");
    setCameraActive(false);
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
      setSearchResults(await searchProducts(query));
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
      closeSearch();
    } catch (error) {
      console.error("Failed to add product:", error);
      Alert.alert("Error", "Could not add the product.");
    }
  }

  function closeSearch() {
    setSearchVisible(false);
    setSearchQuery("");
    setSearchResults([]);
    setScanMode("scan");
    setCameraReady(false);
    setCameraActive(false);
    setTimeout(() => setCameraActive(true), 250);
  }

  function openOcr() {
    if (locked) return;
    setSearchVisible(false);
    setScanMode("ocr");
    setOcrText("");
    setOcrResults([]);
    setOcrVisible(false);
    setCameraReady(false);
    setCameraActive(false);
    setTimeout(() => setCameraActive(true), 250);
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
              setCameraActive(false);
              setSession({ ...session, status: "completed", finishedAt: new Date().toISOString() });
              Alert.alert(
                "Inventory Completed",
                `${session.name} is now locked. Export it from Archive when you are ready.`,
                [
                  { text: "Stay Here", style: "cancel" },
                  { text: "Open Archive", onPress: () => router.push("/archive") },
                ],
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

  function openMenu() {
    Alert.alert("Inventory Counter", "Choose an action", [
      { text: "Import Products", onPress: () => router.push("/import") },
      { text: "Archive", onPress: () => router.push("/archive") },
      { text: "Cancel", style: "cancel" },
    ]);
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
        <Text style={styles.permissionText}>Camera access is required to scan product barcodes.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const cameraShouldRun = cameraActive && (scanMode === "scan" || scanMode === "ocr") && !locked;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={openMenu}><Ionicons name="menu-outline" size={27} color="#f5f5f5" /></TouchableOpacity>
        <View style={styles.titleBlock}><Text style={styles.header}>INVENTORY COUNTER</Text><Text style={styles.sessionName}>{session?.name}</Text></View>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/archive")}><Ionicons name="calendar-outline" size={24} color="#f5f5f5" /></TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={openMenu}><Ionicons name="ellipsis-vertical" size={23} color="#f5f5f5" /></TouchableOpacity>
        </View>
      </View>

      {locked && <View style={styles.lockedBanner}><Ionicons name="lock-closed" size={14} color="#ff8b8b" /><Text style={styles.lockedText}>COMPLETED • LOCKED</Text></View>}

      <View style={styles.cameraSection}>
        <View style={styles.cameraCard}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            active={cameraShouldRun}
            zoom={zoom}
            autofocus="on"
            onCameraReady={() => setCameraReady(true)}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e"] }}
            onBarcodeScanned={cameraShouldRun && scanMode === "scan" ? handleBarcodeScanned : undefined}
          />
          <View style={styles.cameraShade} />
          <View style={styles.scanFrame} />
          <View style={styles.cameraStatus}><Text style={styles.cameraStatusText}>{scanMode === "ocr" ? "OCR • POINT AT PRODUCT LABEL" : "BARCODE READY"}</Text></View>
          {scanMode === "ocr" ? (
            <TouchableOpacity style={styles.ocrCaptureButton} onPress={() => void captureOcr()} disabled={ocrBusy || !cameraReady}>
              {ocrBusy ? <ActivityIndicator color="#071009" /> : <Ionicons name="scan-outline" size={24} color="#071009" />}
              <Text style={styles.ocrCaptureText}>{ocrBusy ? "READING..." : "CAPTURE & READ"}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.zoomControl}>
              {[0, 0.5, 1].map((value, index) => (
                <TouchableOpacity key={value} style={[styles.zoomButton, zoom === value && styles.zoomButtonActive]} onPress={() => setZoom(value)}>
                  <Text style={[styles.zoomText, zoom === value && styles.zoomTextActive]}>{index === 0 ? "1x" : index === 1 ? "1.5x" : "2x"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.modeRow}>
          <TouchableOpacity style={[styles.modeButton, scanMode === "scan" && styles.modeButtonActive]} onPress={() => { setScanMode("scan"); setCameraReady(false); setCameraActive(false); setTimeout(() => setCameraActive(true), 250); }} disabled={locked}>
            <Ionicons name="scan-outline" size={24} color={scanMode === "scan" ? "#70e884" : "#e7e7e7"} /><Text style={[styles.modeText, scanMode === "scan" && styles.modeTextActive]}>SCAN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeButton, scanMode === "ocr" && styles.modeButtonActive]} onPress={openOcr} disabled={locked}>
            <Ionicons name="scan-circle-outline" size={24} color={scanMode === "ocr" ? "#70e884" : "#e7e7e7"} /><Text style={[styles.modeText, scanMode === "ocr" && styles.modeTextActive]}>OCR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeButton, scanMode === "search" && styles.modeButtonActive]} onPress={openSearch} disabled={locked}>
            <Ionicons name="search-outline" size={24} color={scanMode === "search" ? "#70e884" : "#e7e7e7"} /><Text style={[styles.modeText, scanMode === "search" && styles.modeTextActive]}>SEARCH</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Items Added ({items.length})</Text><Text style={styles.sectionHint}>Newest items appear below</Text></View>

      <FlatList
        style={styles.itemList}
        data={items}
        keyExtractor={(item) => item.barcode}
        renderItem={({ item, index }) => <InventoryItemRow item={item} index={index} locked={locked} onDecrease={() => void changeQuantity(item, -1)} onIncrease={() => void changeQuantity(item, 1)} onSetQuantity={() => openQuantityEditor(item)} />}
        ListEmptyComponent={<View style={styles.emptyState}><Ionicons name="cube-outline" size={34} color="#4d4d4d" /><Text style={styles.emptyTitle}>No items counted yet</Text><Text style={styles.emptyText}>Scan a barcode, use OCR, or Search to add the first item.</Text></View>}
        ListFooterComponent={<View style={styles.footer}>{!locked && <TouchableOpacity style={styles.manualButton} onPress={openSearch}><Ionicons name="add" size={22} color="#071009" /><Text style={styles.manualButtonText}>ADD MANUALLY</Text></TouchableOpacity>}<TouchableOpacity style={[styles.completeButton, locked && styles.completeButtonDisabled]} onPress={handleCompleteInventory} disabled={locked}><Ionicons name={locked ? "lock-closed-outline" : "checkmark-circle-outline"} size={21} color={locked ? "#686868" : "#f4f4f4"} /><Text style={[styles.completeButtonText, locked && styles.completeButtonTextDisabled]}>{locked ? "INVENTORY COMPLETED" : "COMPLETE INVENTORY"}</Text></TouchableOpacity></View>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#70e884" />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={ocrVisible} transparent animationType="slide" onRequestClose={() => setOcrVisible(false)}>
        <View style={styles.ocrBackdrop}>
          <View style={styles.ocrSheet}>
            <View style={styles.ocrHeader}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>OCR Result</Text><Text style={styles.modalSubtitle}>Select a product if OCR could not make an exact code match.</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setOcrVisible(false)}><Ionicons name="close" size={24} color="#f2f2f2" /></TouchableOpacity></View>
            <View style={styles.ocrTextBox}><Text style={styles.ocrLabel}>READ TEXT</Text><Text style={styles.ocrText}>{ocrText || "No text detected."}</Text></View>
            <Text style={styles.ocrMatchesTitle}>PRODUCT MATCHES</Text>
            {ocrResults.length === 0 ? <View style={styles.searchEmpty}><Ionicons name="alert-circle-outline" size={30} color="#777" /><Text style={styles.searchEmptyText}>No matching product found. Try again closer to the label.</Text></View> : <FlatList data={ocrResults} keyExtractor={(item) => String(item.id)} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <TouchableOpacity style={styles.searchResult} onPress={() => void addOcrProduct(item)}><View style={styles.searchResultInfo}><Text style={styles.searchResultName} numberOfLines={1}>{item.productName}</Text><Text style={styles.searchResultMeta}>{item.productCode} • {item.barcode}</Text></View><View style={styles.addMatch}><Ionicons name="add" size={20} color="#071009" /><Text style={styles.addMatchText}>+1</Text></View></TouchableOpacity>} />}
            <TouchableOpacity style={styles.retryOcrButton} onPress={() => setOcrVisible(false)}><Ionicons name="camera-outline" size={20} color="#e7e7e7" /><Text style={styles.retryOcrText}>BACK TO CAMERA</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={quantityItem !== null} transparent animationType="fade" onRequestClose={() => setQuantityItem(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.modalCard}><Text style={styles.modalTitle}>Set Quantity</Text><Text style={styles.modalSubtitle} numberOfLines={1}>{quantityItem?.productName || quantityItem?.barcode}</Text><TextInput value={quantityInput} onChangeText={setQuantityInput} keyboardType="number-pad" autoFocus selectTextOnFocus style={styles.quantityInput} /><View style={styles.modalActions}><TouchableOpacity style={styles.modalCancel} onPress={() => setQuantityItem(null)} disabled={savingQuantity}><Text style={styles.modalCancelText}>CANCEL</Text></TouchableOpacity><TouchableOpacity style={styles.modalSave} onPress={saveEditedQuantity} disabled={savingQuantity}><Text style={styles.modalSaveText}>{savingQuantity ? "SAVING..." : "SAVE"}</Text></TouchableOpacity></View></View></KeyboardAvoidingView>
      </Modal>

      <Modal visible={searchVisible} transparent animationType="slide" onRequestClose={closeSearch}>
        <KeyboardAvoidingView style={styles.searchBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.searchSheet}><View style={styles.searchHeader}><View><Text style={styles.modalTitle}>Find Product</Text><Text style={styles.modalSubtitle}>Code, name, or barcode</Text></View><TouchableOpacity style={styles.closeButton} onPress={closeSearch}><Ionicons name="close" size={24} color="#f2f2f2" /></TouchableOpacity></View><TextInput value={searchQuery} onChangeText={(value) => void runSearch(value)} placeholder="Search products..." placeholderTextColor="#666" autoFocus style={styles.searchInput} />{searchLoading ? <View style={styles.searchEmpty}><Text style={styles.searchEmptyText}>Searching...</Text></View> : searchResults.length === 0 ? <View style={styles.searchEmpty}><Ionicons name="search-outline" size={30} color="#555" /><Text style={styles.searchEmptyText}>{searchQuery ? "No matching products" : "Start typing to search"}</Text></View> : <FlatList data={searchResults} keyExtractor={(item) => String(item.id)} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <TouchableOpacity style={styles.searchResult} onPress={() => void addProductFromSearch(item)}><View style={styles.searchResultInfo}><Text style={styles.searchResultName} numberOfLines={1}>{item.productName}</Text><Text style={styles.searchResultMeta}>{item.productCode} • {item.barcode}</Text></View><Ionicons name="add-circle-outline" size={24} color="#70e884" /></TouchableOpacity>} showsVerticalScrollIndicator={false} />}</View></KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#090909" },
  center: { flex: 1, backgroundColor: "#090909", alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: "#d8d8d8", fontSize: 17, marginTop: 12 },
  topBar: { minHeight: 68, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  titleBlock: { flex: 1, alignItems: "center" },
  header: { color: "#f4f4f4", fontSize: 20, fontWeight: "800", letterSpacing: 0.7 },
  sessionName: { color: "#777", fontSize: 12, marginTop: 3 },
  topActions: { flexDirection: "row" },
  lockedBanner: { marginHorizontal: 14, marginBottom: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: "#241616", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  lockedText: { color: "#ff8b8b", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  cameraSection: { flexShrink: 0 },
  cameraCard: { height: 250, marginHorizontal: 14, borderRadius: 18, overflow: "hidden", backgroundColor: "#171717", borderWidth: 1, borderColor: "#252525" },
  cameraShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.14)" },
  scanFrame: { position: "absolute", left: "12%", right: "12%", top: "28%", height: "40%", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 14 },
  cameraStatus: { position: "absolute", top: 12, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.65)" },
  cameraStatusText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  zoomControl: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", padding: 3, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.72)" },
  zoomButton: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 8 },
  zoomButtonActive: { backgroundColor: "#17261b" },
  zoomText: { color: "#d8d8d8", fontSize: 13, fontWeight: "700" },
  zoomTextActive: { color: "#70e884" },
  ocrCaptureButton: { position: "absolute", bottom: 10, alignSelf: "center", minHeight: 46, paddingHorizontal: 18, borderRadius: 12, backgroundColor: "#45c65a", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  ocrCaptureText: { color: "#071009", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  modeRow: { marginHorizontal: 14, marginTop: 8, flexDirection: "row", gap: 8 },
  modeButton: { flex: 1, minHeight: 54, borderRadius: 12, backgroundColor: "#171717", borderWidth: 1, borderColor: "#242424", alignItems: "center", justifyContent: "center", gap: 2 },
  modeButtonActive: { backgroundColor: "#142219", borderColor: "#294d31" },
  modeText: { color: "#e7e7e7", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  modeTextActive: { color: "#70e884" },
  sectionHeader: { marginHorizontal: 14, marginTop: 10, marginBottom: 6, paddingHorizontal: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { color: "#f5f5f5", fontSize: 18, fontWeight: "800" },
  sectionHint: { color: "#5d5d5d", fontSize: 10 },
  itemList: { flex: 1 },
  listContent: { paddingBottom: 20 },
  emptyState: { marginHorizontal: 14, minHeight: 100, borderRadius: 14, borderWidth: 1, borderColor: "#202020", backgroundColor: "#111", alignItems: "center", justifyContent: "center", padding: 15 },
  emptyTitle: { color: "#cfcfcf", fontSize: 15, fontWeight: "700", marginTop: 7 },
  emptyText: { color: "#666", textAlign: "center", fontSize: 12, marginTop: 4 },
  footer: { marginTop: 5, paddingHorizontal: 14 },
  manualButton: { minHeight: 48, borderRadius: 11, backgroundColor: "#45c65a", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  manualButtonText: { color: "#071009", fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  completeButton: { minHeight: 46, marginTop: 8, borderRadius: 11, backgroundColor: "#242424", borderWidth: 1, borderColor: "#383838", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  completeButtonDisabled: { backgroundColor: "#171717", borderColor: "#242424" },
  completeButtonText: { color: "#f4f4f4", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  completeButtonTextDisabled: { color: "#686868" },
  permissionTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 15 },
  permissionText: { color: "#777", textAlign: "center", lineHeight: 21, marginTop: 9, marginBottom: 22 },
  primaryButton: { backgroundColor: "#45c65a", paddingHorizontal: 26, paddingVertical: 14, borderRadius: 11 },
  primaryButtonText: { color: "#071009", fontWeight: "800" },
  ocrBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  ocrSheet: { maxHeight: "82%", minHeight: "58%", backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: "#2a2a2a", padding: 18 },
  ocrHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  ocrTextBox: { padding: 14, borderRadius: 13, backgroundColor: "#191919", borderWidth: 1, borderColor: "#292929", maxHeight: 110 },
  ocrLabel: { color: "#70e884", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  ocrText: { color: "#ddd", fontSize: 14, lineHeight: 20, marginTop: 6 },
  ocrMatchesTitle: { color: "#777", fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginTop: 16, marginBottom: 5 },
  addMatch: { minWidth: 48, height: 38, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "#45c65a", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 2 },
  addMatchText: { color: "#071009", fontWeight: "900" },
  retryOcrButton: { minHeight: 48, marginTop: 10, borderRadius: 11, backgroundColor: "#242424", borderWidth: 1, borderColor: "#383838", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  retryOcrText: { color: "#e7e7e7", fontSize: 13, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20, backgroundColor: "#191919", borderWidth: 1, borderColor: "#303030" },
  modalTitle: { color: "#f5f5f5", fontSize: 20, fontWeight: "800" },
  modalSubtitle: { color: "#777", fontSize: 13, marginTop: 5 },
  quantityInput: { marginTop: 18, height: 62, borderRadius: 12, backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: "#303030", color: "#fff", fontSize: 30, fontWeight: "800", textAlign: "center" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalCancel: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: "#282828", alignItems: "center", justifyContent: "center" },
  modalCancelText: { color: "#ddd", fontWeight: "800" },
  modalSave: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: "#45c65a", alignItems: "center", justifyContent: "center" },
  modalSaveText: { color: "#071009", fontWeight: "900" },
  searchBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  searchSheet: { maxHeight: "88%", minHeight: "55%", backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: "#2a2a2a", padding: 18 },
  searchHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  closeButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#202020", alignItems: "center", justifyContent: "center" },
  searchInput: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: "#303030", backgroundColor: "#191919", color: "#fff", paddingHorizontal: 15, fontSize: 16 },
  searchEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  searchEmptyText: { color: "#666", marginTop: 9, textAlign: "center", paddingHorizontal: 20 },
  searchResult: { minHeight: 62, marginTop: 8, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#191919", borderWidth: 1, borderColor: "#292929", flexDirection: "row", alignItems: "center" },
  searchResultInfo: { flex: 1, minWidth: 0 },
  searchResultName: { color: "#f2f2f2", fontSize: 15, fontWeight: "700" },
  searchResultMeta: { color: "#777", fontSize: 12, marginTop: 5 },
});
