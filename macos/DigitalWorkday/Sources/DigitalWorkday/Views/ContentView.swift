import SwiftUI

struct ContentView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        Group {
            if store.bootstrap == nil {
                SignInView()
            } else {
                NavigationSplitView {
                    TaskListView()
                        .navigationSplitViewColumnWidth(min: 300, ideal: 380)
                } detail: {
                    if let detail = store.taskDetail { TaskDetailView(detail: detail) }
                    else { ContentUnavailableView("Select a Task", systemImage: "checklist", description: Text("Choose a task to work on it.")) }
                }
                .navigationSplitViewStyle(.balanced)
            }
        }
        .overlay(alignment: .top) { if store.isStale || !store.connectivity.isOnline { OfflineBanner() } }
        .alert("Digital Workday", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
            Button("OK") { store.errorMessage = nil }
        } message: { Text(store.errorMessage ?? "") }
    }
}

private struct SignInView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "checklist.checked").font(.system(size: 54)).foregroundStyle(.tint)
            Text("Digital Workday").font(.largeTitle.bold())
            Text("Your tasks, time, and updates in a focused Mac workspace.").multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Sign In in Browser") { Task { await store.signIn() } }.buttonStyle(.borderedProminent).controlSize(.large)
            if store.isLoading { ProgressView() }
        }.padding(40).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct OfflineBanner: View {
    var body: some View {
        Label("Offline snapshot — changes are disabled", systemImage: "wifi.slash")
            .font(.caption.bold()).padding(.horizontal, 12).padding(.vertical, 6)
            .background(.orange.opacity(0.9), in: Capsule()).padding(8)
    }
}
