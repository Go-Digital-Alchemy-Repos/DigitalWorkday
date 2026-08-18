import SwiftUI

struct TaskListView: View {
    @Environment(AppStore.self) private var store
    @State private var showingQuickAdd = false

    var body: some View {
        @Bindable var store = store
        List(selection: $store.selectedTaskID) {
            ForEach(TaskGrouping.grouped(store.filteredTasks), id: \.0) { group, tasks in
                Section(group.rawValue) {
                    ForEach(tasks) { task in TaskRowView(task: task).tag(task.id) }
                }
            }
        }
        .searchable(text: $store.search, prompt: "Search tasks")
        .onChange(of: store.selectedTaskID) { _, id in Task { await store.selectTask(id) } }
        .toolbar {
            ToolbarItemGroup {
                Menu { FiltersView() } label: { Label("Filters", systemImage: "line.3.horizontal.decrease.circle") }
                Button { showingQuickAdd = true } label: { Label("New Task", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showingQuickAdd) { QuickAddView() }
        .overlay { if store.filteredTasks.isEmpty { ContentUnavailableView.search(text: store.search) } }
    }
}

private struct FiltersView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        @Bindable var store = store
        Picker("Status", selection: $store.statusFilter) {
            Text("Open").tag("open"); ForEach(TaskStatus.allCases) { Text($0.label).tag($0.rawValue) }; Text("All").tag("all")
        }
        Picker("Priority", selection: $store.priorityFilter) {
            Text("All Priorities").tag("all"); ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) }
        }
        Picker("Project", selection: $store.projectFilter) {
            Text("All Projects").tag("all"); ForEach(store.bootstrap?.projects ?? []) { Text($0.name).tag($0.id) }
        }
        Picker("Client", selection: $store.clientFilter) {
            Text("All Clients").tag("all"); ForEach(store.bootstrap?.clients ?? []) { Text($0.companyName).tag($0.id) }
        }
    }
}

struct TaskRowView: View {
    let task: DWTask
    @Environment(AppStore.self) private var store
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Button { Task { await store.complete(task) } } label: { Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle") }
                .buttonStyle(.plain).disabled(!store.connectivity.isOnline)
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title).lineLimit(2)
                HStack(spacing: 6) {
                    if let project = task.projectName { Text(project) }
                    if let due = task.dueDate { Text(due, style: .date) }
                }.font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Circle().fill(priorityColor).frame(width: 7, height: 7).padding(.top, 5)
        }.padding(.vertical, 3)
    }
    private var priorityColor: Color { switch task.priority { case "urgent": .red; case "high": .orange; case "medium": .blue; default: .gray } }
}
