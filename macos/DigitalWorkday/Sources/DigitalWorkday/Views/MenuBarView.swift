import SwiftUI

struct MenuBarView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openWindow) private var openWindow
    @State private var title = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let timer = store.bootstrap?.activeTimer {
                VStack(alignment: .leading, spacing: 4) {
                    Text(timer.title ?? "Active Timer").font(.headline).lineLimit(1)
                    TimelineView(.periodic(from: .now, by: 1)) { _ in Text(DurationFormatter.short(timer.elapsed())).font(.title2.monospacedDigit()) }
                    HStack { Button(timer.status == "running" ? "Pause" : "Resume") { Task { await store.timer(action: timer.status == "running" ? "pause" : "resume") } }; Button("Stop") { Task { await store.timer(action: "stop") } } }
                }
                Divider()
            }
            TextField("Quick personal task", text: $title, onCommit: add).textFieldStyle(.roundedBorder)
            HStack { Button("Add Task", action: add).disabled(title.isEmpty || !store.connectivity.isOnline); Spacer(); Button("Open Tasks") { openWindow(id: "tasks"); NSApp.activate(ignoringOtherApps: true) } }
            Divider()
            HStack { Button("Refresh") { Task { await store.refresh() } }; Spacer(); Button("Quit") { NSApp.terminate(nil) } }
        }.padding(14).frame(width: 300)
    }
    private func add() { let value = title; title = ""; Task { await store.createTask(title: value, projectID: nil) } }
}
