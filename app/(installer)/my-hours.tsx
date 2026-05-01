import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { authFetch } from "@/lib/api";

type TrailPoint = {
  lat: number;
  lng: number;
  logged_at: string;
  within_range: boolean;
};

type Shift = {
  id: string;
  job_id: string;
  job_name: string;
  job_address: string;
  signed_in_at: string | null;
  signed_out_at: string | null;
  duration_minutes: number | null;
  date_key: string | null;
  breadcrumb_count: number;
  trail: TrailPoint[];
  auto_closed?: boolean;
  auto_closed_reason?: string | null;
};

type Day = {
  date: string;
  total_minutes: number;
  shifts: Shift[];
};

function fmtTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(mins: number): string {
  if (!mins || mins <= 0) return "0h 0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function fmtDateLabel(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function MyHoursScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState<Day[]>([]);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/installer/my-hours");
      const data = await res.json();
      if (data?.days) {
        setDays(data.days);
        // Auto-select today's first shift if available
        if (data.days.length > 0 && data.days[0].shifts.length > 0) {
          setSelectedShift(data.days[0].shifts[0]);
        }
      }
    } catch (err) {
      console.error("[my-hours] load failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Stack.Screen options={{ title: "My Hours" }} />
        <ActivityIndicator color="#00d4a0" size="large" />
      </View>
    );
  }

  const totalWeek = days
    .slice(0, 7)
    .reduce((sum, d) => sum + (d.total_minutes || 0), 0);

  const trail = selectedShift?.trail || [];
  const hasTrail = trail.length > 1;
  const initialRegion =
    hasTrail && trail[0]
      ? {
          latitude: trail[0].lat,
          longitude: trail[0].lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }
      : undefined;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "My Hours",
          headerStyle: { backgroundColor: "#0f1923" },
          headerTintColor: "#fff",
          headerTitleStyle: { color: "#fff" },
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00d4a0"
          />
        }
      >
        {/* Hero card — explains the user benefit */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Your work record</Text>
          <Text style={styles.heroBody}>
            Vantro records your GPS-verified hours so you have proof of every minute on site. If you forget to sign out, your shift is automatically closed at your last on-site GPS point so you do not lose pay. Use this as your own evidence for any payroll dispute.
          </Text>
        </View>

        {/* Week summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Last 7 days on site</Text>
          <Text style={styles.summaryValue}>{fmtDuration(totalWeek)}</Text>
        </View>

        {days.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No work record yet. Sign in to a job and your hours will appear
              here.
            </Text>
          </View>
        )}

        {/* Map of selected shift trail */}
        {selectedShift && (
          <View style={styles.mapCard}>
            <Text style={styles.mapTitle}>
              GPS trail — {selectedShift.job_name}
            </Text>
            <Text style={styles.mapSub}>
              {fmtTime(selectedShift.signed_in_at)} →{" "}
              {fmtTime(selectedShift.signed_out_at)} ·{" "}
              {selectedShift.duration_minutes
                ? fmtDuration(selectedShift.duration_minutes)
                : "active"}
            </Text>
            {hasTrail && initialRegion ? (
              <MapView
                provider={PROVIDER_DEFAULT}
                style={styles.map}
                initialRegion={initialRegion}
              >
                <Polyline
                  coordinates={trail.map((p) => ({
                    latitude: p.lat,
                    longitude: p.lng,
                  }))}
                  strokeColor="#00d4a0"
                  strokeWidth={4}
                />
                <Marker
                  coordinate={{
                    latitude: trail[0].lat,
                    longitude: trail[0].lng,
                  }}
                  title="Sign in"
                  pinColor="#00d4a0"
                />
                <Marker
                  coordinate={{
                    latitude: trail[trail.length - 1].lat,
                    longitude: trail[trail.length - 1].lng,
                  }}
                  title="Latest point"
                  pinColor="#ff6b6b"
                />
              </MapView>
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mapPlaceholderText}>
                  GPS trail will appear once you've worked a full shift.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* History list */}
        {days.map((d) => (
          <View key={d.date} style={styles.daySection}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayHeaderTitle}>{fmtDateLabel(d.date)}</Text>
              <Text style={styles.dayHeaderTotal}>
                {fmtDuration(d.total_minutes)}
              </Text>
            </View>
            {d.shifts.map((sh) => {
              const isSelected = selectedShift?.id === sh.id;
              return (
                <TouchableOpacity
                  key={sh.id}
                  style={[
                    styles.shiftRow,
                    isSelected && styles.shiftRowSelected,
                  ]}
                  onPress={() => setSelectedShift(sh)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shiftJob} numberOfLines={1}>
                      {sh.job_name}
                    </Text>
                    <Text style={styles.shiftTime}>
                      {fmtTime(sh.signed_in_at)} → {fmtTime(sh.signed_out_at)}
                    </Text>
                  </View>
                  <View style={styles.shiftRight}>
                    <Text style={styles.shiftDuration}>
                      {sh.duration_minutes
                        ? fmtDuration(sh.duration_minutes)
                        : "active"}
                    </Text>
                    <Text style={styles.shiftBc}>
                      {sh.breadcrumb_count} GPS points
                    </Text>
                    {sh.auto_closed && (
                      <View style={styles.autoBadge}>
                        <Text style={styles.autoBadgeText}>AUTO</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1923" },
  loadingWrap: {
    flex: 1,
    backgroundColor: "#0f1923",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  heroCard: {
    backgroundColor: "#1a2733",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#00d4a0",
  },
  heroTitle: {
    color: "#00d4a0",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  heroBody: { color: "#cfd8dc", fontSize: 13, lineHeight: 19 },
  summaryCard: {
    backgroundColor: "#1a2733",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: { color: "#9aa5b1", fontSize: 13 },
  summaryValue: { color: "#fff", fontSize: 22, fontWeight: "700" },
  emptyCard: {
    backgroundColor: "#1a2733",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  emptyText: { color: "#cfd8dc", fontSize: 14, lineHeight: 20 },
  mapCard: {
    backgroundColor: "#1a2733",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  mapTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  mapSub: { color: "#9aa5b1", fontSize: 12, marginBottom: 10 },
  map: { width: "100%", height: 240, borderRadius: 8 },
  mapPlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: "#0f1923",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  mapPlaceholderText: {
    color: "#9aa5b1",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  daySection: { marginTop: 8, marginBottom: 4 },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  dayHeaderTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  dayHeaderTotal: { color: "#00d4a0", fontSize: 14, fontWeight: "700" },
  shiftRow: {
    backgroundColor: "#1a2733",
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  shiftRowSelected: { borderColor: "#00d4a0" },
  shiftJob: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  shiftTime: { color: "#9aa5b1", fontSize: 12 },
  shiftRight: { alignItems: "flex-end" },
  shiftDuration: { color: "#fff", fontSize: 13, fontWeight: "700" },
  shiftBc: { color: "#9aa5b1", fontSize: 11, marginTop: 2 },
  autoBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#00d4a0",
  },
  autoBadgeText: {
    color: "#0f1923",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});