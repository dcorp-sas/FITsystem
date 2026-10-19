import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme';
import { Card, Muted, ScreenHeader } from '../components/ui';
import { portal, type NewsItem } from '../lib/api';

export function NewsScreen() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const res = await portal.news();
    setItems(res.items);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primaryLight}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      <ScreenHeader icon="megaphone-outline" title="Novedades" subtitle="Lo último de tu gimnasio" />
      {items.length === 0 ? (
        <Card>
          <Muted>No hay novedades por ahora.</Muted>
        </Card>
      ) : (
        items.map((n) => (
          <Card key={n.id}>
            <Text style={styles.title}>{n.title}</Text>
            <Muted>{new Date(n.publishedAt).toLocaleDateString('es-AR')}</Muted>
            <Text style={styles.body}>{n.body}</Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  body: { color: colors.text, fontSize: 14, marginTop: spacing.sm, lineHeight: 20 },
});
