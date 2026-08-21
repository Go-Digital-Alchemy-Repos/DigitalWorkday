import SwiftUI

struct WorkspaceToolbarView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    @Environment(\.openSettings) private var openSettings
    @State private var now = Date.now
    @State private var showingAccountMenu = false

    var body: some View {
        HStack(spacing: 12) {
            Text("Digital Workday").font(.headline)
            Spacer(minLength: 12)
            Button { store.showingCommandBar = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                    Text("Search or type a command…").lineLimit(1)
                    Text("⌘K").font(.caption2.monospaced()).padding(.horizontal, 6).padding(.vertical, 3)
                        .background(theme.subtleFill, in: RoundedRectangle(cornerRadius: 5))
                }
                .foregroundStyle(.secondary).padding(.horizontal, 11).frame(height: 32)
                .background(theme.subtleFill, in: RoundedRectangle(cornerRadius: theme.compactRadius, style: .continuous))
            }.buttonStyle(.plain).frame(maxWidth: 390)
            Spacer(minLength: 12)
            TimerPillView()
            Button { store.destination = .notifications } label: {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "bell").font(.body)
                    if store.unreadNotificationCount > 0 {
                        Circle().fill(theme.emphasis).frame(width: 7, height: 7).offset(x: 3, y: -2)
                    }
                }.frame(width: 28, height: 28)
            }.buttonStyle(.plain).help("Notifications")
            if let user = store.bootstrap?.user {
                Button { showingAccountMenu.toggle() } label: {
                    AvatarView(user: user, size: 28)
                }
                .buttonStyle(.plain)
                .contentShape(Circle())
                .help("Account")
                .popover(isPresented: $showingAccountMenu, arrowEdge: .top) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            AvatarView(user: user, size: 38)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.displayName).font(.headline)
                                Text(user.email).font(.caption).foregroundStyle(.secondary)
                                Text(user.role.capitalized).font(.caption2).foregroundStyle(.tertiary)
                            }
                        }
                        Divider()
                        Button("Profile & Settings", systemImage: "person.crop.circle") {
                            showingAccountMenu = false
                            openSettings()
                        }
                        .buttonStyle(.plain)
                        Link(destination: URL(string: "https://digitalworkday.ai/profile")!) {
                            Label("Open Profile on Web", systemImage: "safari")
                        }
                        .buttonStyle(.plain)
                        Divider()
                        Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                            showingAccountMenu = false
                            Task { await store.signOut() }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(16)
                    .frame(width: 260, alignment: .leading)
                }
            }
        }
        .padding(.horizontal, 14).frame(height: 48)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }
}

struct TimerPillView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    var body: some View {
        if let timer = store.bootstrap?.activeTimer {
            HStack(spacing: 8) {
                Circle().fill(theme.emphasis).frame(width: 7, height: 7)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(DurationFormatter.short(timer.elapsed(at: context.date))).monospacedDigit().font(.caption.bold())
                }
                Text(timer.title ?? "Active timer").lineLimit(1).font(.caption).foregroundStyle(.secondary)
                Button { Task { await store.timer(action: timer.status == "running" ? "pause" : "resume") } } label: {
                    Image(systemName: timer.status == "running" ? "pause.fill" : "play.fill")
                }.buttonStyle(.plain)
                Button { Task { await store.timer(action: "stop") } } label: { Image(systemName: "stop.fill") }.buttonStyle(.plain)
            }
            .padding(.horizontal, 10).frame(height: 30)
            .background(theme.selection, in: Capsule()).overlay { Capsule().stroke(theme.divider) }
        }
    }
}
