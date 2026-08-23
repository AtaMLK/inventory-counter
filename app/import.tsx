import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  parseExcelFile,
  pickExcelFile,
  type ImportResult,
} from "@/database/excel";

import { importProducts } from "@/database/database";

export default function ImportScreen() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function selectFile() {
    try {
      setLoading(true);
      setResult(null);

      const file = await pickExcelFile();

      if (!file) {
        return;
      }

      const parsed = await parseExcelFile(file.uri);

      setResult(parsed);
    } catch (error) {
      console.error("Excel selection failed:", error);

      Alert.alert("Import Error", "Could not read the Excel file.");
    } finally {
      setLoading(false);
    }
  }

  async function importData() {
    const currentResult = result;

    if (!currentResult || currentResult.products.length === 0) {
      return;
    }

    const productsToImport = currentResult.products;

    try {
      setLoading(true);

      await importProducts(productsToImport);

      const importedCount = productsToImport.length;

      Alert.alert(
        "Import Complete",
        `${importedCount} products imported successfully.`,
        [
          {
            text: "Back to Inventory",
            onPress: () => router.replace("/"),
          },
        ],
      );

      setResult(null);
    } catch (error) {
      console.error("Import failed:", error);

      Alert.alert("Import Error", "Could not save the products.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Import Products</Text>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace("/")}
      >
        <Text style={styles.backButtonText}>← Inventory</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={selectFile}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Select Excel File</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator size="large" style={styles.loading} />}

      {result && (
        <ScrollView
          style={styles.result}
          contentContainerStyle={{
            paddingBottom: 30,
          }}
        >
          <Text style={styles.summary}>
            Valid products: {result.products.length}
          </Text>

          <Text style={styles.summary}>Errors: {result.errors.length}</Text>

          {result.errors.length > 0 && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Import Errors</Text>

              {result.errors.map((error, index) => (
                <Text key={`${error}-${index}`} style={styles.errorText}>
                  • {error}
                </Text>
              ))}
            </View>
          )}

          {result.products.length > 0 && (
            <>
              <Text style={styles.previewTitle}>Preview</Text>

              {result.products.slice(0, 20).map((product) => (
                <View key={product.productCode} style={styles.productRow}>
                  <Text style={styles.productCode}>{product.productCode}</Text>

                  <Text style={styles.productName}>{product.productName}</Text>

                  <Text style={styles.barcode}>{product.barcode}</Text>
                </View>
              ))}

              {result.errors.length === 0 && (
                <TouchableOpacity
                  style={styles.importButton}
                  onPress={importData}
                  disabled={loading}
                >
                  <Text style={styles.importButtonText}>Import Products</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    paddingTop: 70,
    paddingHorizontal: 20,
  },

  title: {
    color: "white",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 25,
  },

  backButton: {
    marginBottom: 20,
  },

  backButtonText: {
    color: "#aaa",
    fontSize: 16,
  },

  button: {
    backgroundColor: "white",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },

  buttonText: {
    color: "#111",
    fontSize: 17,
    fontWeight: "700",
  },

  loading: {
    marginTop: 25,
  },

  result: {
    marginTop: 25,
  },

  summary: {
    color: "white",
    fontSize: 18,
    marginBottom: 8,
  },

  errorBox: {
    backgroundColor: "#2a1717",
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
  },

  errorTitle: {
    color: "#ff8080",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },

  errorText: {
    color: "#ffb0b0",
    marginBottom: 5,
  },

  previewTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 25,
    marginBottom: 10,
  },

  productRow: {
    backgroundColor: "#1c1c1c",
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
  },

  productCode: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  productName: {
    color: "#aaa",
    marginTop: 4,
  },

  barcode: {
    color: "#666",
    marginTop: 4,
  },

  importButton: {
    backgroundColor: "white",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },

  importButtonText: {
    color: "#111",
    fontSize: 17,
    fontWeight: "700",
  },
});
