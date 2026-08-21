import SwiftUI

struct ContentView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme

    var body: some View {
        Group {
            if store.bootstrap == nil { SignInView() }
            else { commandCenter }
        }
        .overlay(alignment: .top) { if store.isStale || !store.connectivity.isOnline { OfflineBanner() } }
        .alert("Digital Workday", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) { Button("OK") { store.errorMessage = nil } } message: { Text(store.errorMessage ?? "") }
        .onReceive(NotificationCenter.default.publisher(for: .dwRefresh)) { _ in Task { await store.refresh() } }
        .onReceive(NotificationCenter.default.publisher(for: .dwCommandBar)) { _ in store.showingCommandBar = true }
        .sheet(isPresented: Binding(get: { store.showingCommandBar }, set: { store.showingCommandBar = $0 })) { CommandBarView() }
    }

    private var commandCenter: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            VStack(spacing: 0) {
                WorkspaceToolbarView()
                if width >= 720 {
                    HStack(spacing: 0) {
                        NavigationRailView()
                        if width >= 980 {
                            primaryPane
                                .frame(width: min(DWDesign.primaryPaneWidth, max(390, width * 0.37)))
                            Divider()
                            detailPane
                        } else {
                            primaryPane
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                } else {
                    VStack(spacing: 0) { compactPane; CompactNavigationBar() }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
        }
    }

    @ViewBuilder private var primaryPane: some View {
        switch store.destination {
        case .today: TodayView()
        case .tasks: TaskListView()
        case .upcoming: UpcomingView()
        case .notifications: NotificationInboxView()
        }
    }

    private var detailPane: some View {
        Group {
            if let detail = store.taskDetail {
                TaskDetailView(detail: detail)
                    .id(TaskDetailViewIdentity(taskID: detail.task.id, updatedAt: detail.task.updatedAt))
            }
            else { EmptyTaskDetailView() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder private var compactPane: some View {
        if store.taskDetail != nil && store.destination == .tasks { detailPane }
        else { primaryPane }
    }
}

private struct SignInView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    var body: some View {
        ZStack {
            theme.canvas.ignoresSafeArea()
            VStack(spacing: 20) {
                BrandLogoView(size: 88)
                    .shadow(color: theme.isEditorial ? .clear : .black.opacity(0.12), radius: 12, y: 5)
                Text("Digital Workday").font(.system(.largeTitle, design: .rounded, weight: .bold))
                Text("Your daily command center for tasks, time, and momentum.").multilineTextAlignment(.center).foregroundStyle(.secondary).frame(maxWidth: 380)
                Button("Sign In in Browser") { Task { await store.signIn() } }.dwPrimaryActionStyle().controlSize(.large)
                if store.isLoading { ProgressView("Connecting…").controlSize(.small) }
            }.padding(48)
        }
    }
}

private struct EmptyTaskDetailView: View {
    @Environment(\.dwTheme) private var theme
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "checklist").font(.system(size: 42)).foregroundStyle(theme.emphasis)
            Text("Plan the day, then do the work").font(.title2.bold())
            Text("Choose a task to see its description, subtasks, comments, and time controls.").foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 360)
        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(theme.canvas)
    }
}

private struct OfflineBanner: View {
    var body: some View {
        Label("Offline snapshot — changes are disabled", systemImage: "wifi.slash").font(.caption.bold()).foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 7).background(.orange, in: Capsule()).shadow(radius: 8, y: 3).padding(8)
    }
}
