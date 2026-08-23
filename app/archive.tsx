import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  getCompletedSessions,
  type InventorySession,
} from '@/database/database';

import { exportInventoryToExcel } from '@/database/export';

export default function ArchiveScreen() {
  const [sessions, setSessions] = useState<
    InventorySession[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [exportingId, setExportingId] =
    useState<number | null>(null);

  async function loadArchive() {
    try {
      setLoading(true);

      const data =
        await getCompletedSessions();

      setSessions(data);
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Error',
        'Could not load inventory archive.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArchive();
  }, []);

  async function exportSession(
    session: InventorySession
  ) {
    try {
      setExportingId(session.id);

      await exportInventoryToExcel(
        session.id,
        session.name
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Export Error',
        'Could not export this inventory.'
      );
    } finally {
      setExportingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/')}
        >
          <Text style={styles.back}>
            ← Inventory
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Archive
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          style={styles.loading}
        />
      ) : sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            No Completed Inventories
          </Text>

          <Text style={styles.emptyText}>
            Completed monthly inventories will appear
            here.
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadArchive}
            />
          }
          contentContainerStyle={
            styles.list
          }
        >
          {sessions.map((session) => (
            <View
              key={session.id}
              style={styles.card}
            >
              <View>
                <Text style={styles.sessionName}>
                  {session.name}
                </Text>

                <Text style={styles.status}>
                  Completed
                </Text>

                {session.finishedAt && (
                  <Text style={styles.date}>
                    {new Date(
                      session.finishedAt
                    ).toLocaleString()}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.exportButton}
                onPress={() =>
                  exportSession(session)
                }
                disabled={
                  exportingId === session.id
                }
              >
                {exportingId === session.id ? (
                  <ActivityIndicator />
                ) : (
                  <Text
                    style={styles.exportText}
                  >
                    Export
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 65,
    paddingHorizontal: 20,
  },

  header: {
    marginBottom: 25,
  },

  back: {
    color: '#aaa',
    fontSize: 16,
    marginBottom: 15,
  },

  title: {
    color: 'white',
    fontSize: 32,
    fontWeight: '800',
  },

  loading: {
    marginTop: 50,
  },

  list: {
    paddingBottom: 30,
  },

  card: {
    backgroundColor: '#1c1c1c',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sessionName: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },

  status: {
    color: '#888',
    marginTop: 5,
  },

  date: {
    color: '#666',
    marginTop: 5,
    fontSize: 12,
  },

  exportButton: {
    backgroundColor: 'white',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },

  exportText: {
    color: '#111',
    fontWeight: '700',
  },

  empty: {
    alignItems: 'center',
    marginTop: 80,
  },

  emptyTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
  },

  emptyText: {
    color: '#777',
    textAlign: 'center',
    marginTop: 10,
  },
});