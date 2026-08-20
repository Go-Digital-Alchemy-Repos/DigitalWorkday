import SwiftUI

struct TaskListView: View {
    @Environment(AppStore.self) private var store
    @State private var showingQuickAdd = false

    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) { Text("Tasks").font(.system(size: 25, weight: .bold, design: .rounded)); Text("\(store.filteredTasks.count) open items").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Menu { FiltersView() } label: { Image(systemName: "line.3.horizontal.decrease") }.menuStyle(.borderlessButton)
                Button { showingQuickAdd = true } label: { Image(systemName: "plus") }.buttonStyle(.borderedProminent).buttonBorderShape(.circle)
            }.padding(16)
            HStack { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("Search tasks", text: $store.search).textFieldStyle(.plain) }
                .padding(.horizontal, 11).frame(height: 34).background(DWDesign.subtleFill, in: RoundedRectangle(cornerRadius: 8)).padding(.horizontal, 16).padding(.bottom, 12)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    ForEach(TaskGrouping.grouped(store.filteredTasks), id: \.0) { group, tasks in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack { Text(group.rawValue).font(.caption.bold()); Spacer(); Text("\(tasks.count)").font(.caption2.monospacedDigit()).foregroundStyle(.tertiary) }
                            VStack(spacing: 0) { ForEach(tasks) { task in CompactTaskRow(task: task); if task.id != tasks.last?.id { Divider().padding(.leading, 40) } } }
                                .background(DWDesign.elevated.opacity(0.7), in: RoundedRectangle(cornerRadius: 11)).overlay { RoundedRectangle(cornerRadius: 11).stroke(DWDesign.divider) }
                        }
                    }
                }.padding(16)
            }
            .overlay { if store.filteredTasks.isEmpty { ContentUnavailableView(store.search.isEmpty ? "All clear" : "No matching tasks", systemImage: store.search.isEmpty ? "checkmark.circle" : "magnifyingglass") } }
        }
        .background(DWDesign.canvas)
        .sheet(isPresented: $showingQuickAdd) { QuickAddView() }
        .onReceive(NotificationCenter.default.publisher(for: .dwNewTask)) { _ in showingQuickAdd = true }
    }
}

private struct FiltersView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        @Bindable var store = store
        Picker("Status", selection: $store.statusFilter) { Text("Open").tag("open"); ForEach(TaskStatus.allCases) { Text($0.label).tag($0.rawValue) }; Text("All").tag("all") }
        Picker("Priority", selection: $store.priorityFilter) { Text("All Priorities").tag("all"); ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) } }
        Picker("Project", selection: $store.projectFilter) { Text("All Projects").tag("all"); ForEach(store.bootstrap?.projects ?? []) { Text($0.name).tag($0.id) } }
        Picker("Client", selection: $store.clientFilter) { Text("All Clients").tag("all"); ForEach(store.bootstrap?.clients ?? []) { Text($0.companyName).tag($0.id) } }
    }
}
