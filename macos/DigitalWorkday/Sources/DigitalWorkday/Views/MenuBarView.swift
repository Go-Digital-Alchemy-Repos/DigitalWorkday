import SwiftUI

struct MenuBarView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings
    @State private var title = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let user = store.bootstrap?.user {
                HStack(spacing: 10) {
                    AvatarView(user: user, size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(user.displayName).font(.headline).lineLimit(1)
                        Text(store.bootstrap?.workspace.name ?? "Digital Workday").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { openSettings() } label: { Image(systemName: "gearshape") }.buttonStyle(.plain).help("Settings")
                }
                Divider()
            }
            if let timer = store.bootstrap?.activeTimer {
                DWSectionCard("Active Timer", systemImage: "timer") {
                    Text(timer.title ?? "Active Timer").fontWeight(.medium).lineLimit(1)
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text(DurationFormatter.short(timer.elapsed())).font(.title.monospacedDigit().bold())
                    }
                    HStack {
                        Button(timer.status == "running" ? "Pause" : "Resume") { Task { await store.timer(action: timer.status == "running" ? "pause" : "resume") } }
                        Button("Stop") { Task { await store.timer(action: "stop") } }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 7) {
                Text("Quick personal task").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                HStack {
                    TextField("What needs doing?", text: $title, onCommit: add).textFieldStyle(.roundedBorder)
                    Button { add() } label: { Image(systemName: "arrow.up.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(DWDesign.accent)
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.connectivity.isOnline)
                }
            }
            Divider()
            HStack {
                Button("Open Tasks") { openWindow(id: "tasks"); NSApp.activate(ignoringOtherApps: true) }
                    .buttonStyle(.borderedProminent)
                Spacer()
                Button("Refresh") { Task { await store.refresh() } }
                Button("Quit") { NSApp.terminate(nil) }
            }
        }
        .padding(16).frame(width: 330)
    }

    private func add() {
        let value = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        title = ""
        Task { await store.createTask(title: value, projectID: nil) }
    }
}
