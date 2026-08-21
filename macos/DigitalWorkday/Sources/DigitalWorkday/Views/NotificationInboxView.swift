import SwiftUI

struct NotificationInboxView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) { Text("Notifications").font(.system(size: 25, weight: .bold, design: .rounded)); Text("\(store.unreadNotificationCount) unread").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Button("Mark All Read") { Task { await store.markAllNotificationsRead() } }.disabled(store.unreadNotificationCount == 0)
            }.padding(16)
            Divider()
            if store.inbox.isEmpty {
                ContentUnavailableView("You’re all caught up", systemImage: "bell.badge", description: Text("Assignments, comments, and due-date alerts appear here."))
            } else {
                List(store.inbox) { notification in
                    NotificationRow(notification: notification)
                        .listRowBackground(notification.isUnread ? theme.selection : Color.clear)
                }.listStyle(.inset)
            }
        }.background(theme.canvas)
    }
}

private struct NotificationRow: View {
    @Environment(\.dwTheme) private var theme
    @Environment(AppStore.self) private var store
    let notification: DWNotification
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(notification.isUnread ? theme.emphasis : .secondary).frame(width: 24, height: 24).background(theme.subtleFill, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                HStack { Text(notification.title).font(.system(size: 13, weight: notification.isUnread ? .semibold : .regular)); Spacer(); Text(notification.lastEventAt, style: .relative).font(.caption2).foregroundStyle(.tertiary) }
                if let message = notification.message { Text(message).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                Text(category).font(.caption2.weight(.medium)).foregroundStyle(theme.emphasis)
            }
            Menu { Button("Open") { Task { await store.openNotification(notification) } }; Button("Dismiss", role: .destructive) { Task { await store.dismissNotification(notification) } } } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton)
        }.padding(.vertical, 7).contentShape(Rectangle()).onTapGesture { Task { await store.openNotification(notification) } }
    }
    private var category: String { notification.type.contains("comment") ? "Comment" : notification.type.contains("assigned") ? "Assignment" : notification.type.contains("deadline") ? "Due date" : "Update" }
    private var icon: String { notification.type.contains("comment") ? "bubble.left" : notification.type.contains("assigned") ? "person.badge.plus" : notification.type.contains("deadline") ? "calendar.badge.exclamationmark" : "bell" }
}
