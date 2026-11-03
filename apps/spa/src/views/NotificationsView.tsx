import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { NotificationsScreen } from "@ui/notifications-screen.tsx"
import { notificationsStore } from "../state/notifications.ts"

/** Wires the inbox to the notifications store for `/notifications`. */
export function NotificationsView() {
  const [, navigate] = useLocation()
  useEffect(() => {
    void notificationsStore.open()
    return () => notificationsStore.close()
  }, [])
  const store = notificationsStore
  return (
    <NotificationsScreen
      notifications={store.notifications.value}
      unreadCount={store.unreadCount.value}
      loading={store.loading.value}
      loadingMore={store.loadingMore.value}
      hasMore={store.nextCursor.value !== null}
      onLoadMore={() => void store.loadMore()}
      onRead={(id) => void store.markRead(id)}
      onReadAll={() => void store.markAllRead()}
      error={store.error.value}
      navigate={navigate}
    />
  )
}
