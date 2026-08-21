import SwiftUI

struct CommandBarView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var captureTitle = ""
    @State private var projectID: String?
    @State private var dueDate = Date.now
    @State private var hasDueDate = false
    @State private var priority = "medium"
    @State private var assigneeIDs: Set<String> = []
    @State private var estimateMinutes = 0

    private var results: [DWTask] { store.tasks.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }.prefix(6).map { $0 } }

    var body: some View {
        VStack(spacing: 0) {
            HStack { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("Search tasks or enter a new task…", text: $query).textFieldStyle(.plain).font(.title3); Text("esc").font(.caption2.monospaced()).foregroundStyle(.secondary) }
                .padding(16)
            Divider()
            if !query.isEmpty {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(results) { task in
                            Button { store.destination = .tasks; Task { await store.selectTask(task.id) }; dismiss() } label: {
                                HStack { Image(systemName: "checkmark.circle"); VStack(alignment: .leading) { Text(task.title); Text(task.projectName ?? "Personal").font(.caption).foregroundStyle(.secondary) }; Spacer(); Text("Open").font(.caption).foregroundStyle(.secondary) }.padding(10)
                            }.buttonStyle(.plain)
                        }
                        Divider()
                        Button { captureTitle = query } label: { Label("Create “\(query)”", systemImage: "plus.circle.fill").frame(maxWidth: .infinity, alignment: .leading).padding(10) }.buttonStyle(.plain).foregroundStyle(DWDesign.accent)
                    }
                }.frame(maxHeight: 250)
            }
            if !captureTitle.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Quick capture").font(.caption.bold()).foregroundStyle(.secondary)
                    TextField("Task title", text: $captureTitle)
                    Picker("Context", selection: $projectID) { Text("Personal").tag(String?.none); ForEach(store.bootstrap?.projects ?? []) { Text($0.name).tag(Optional($0.id)) } }
                    HStack {
                        Picker("Priority", selection: $priority) { ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) } }
                        Stepper(estimateMinutes == 0 ? "No estimate" : DurationFormatter.short(estimateMinutes * 60), value: $estimateMinutes, in: 0...1440, step: 15)
                    }
                    if projectID != nil {
                        Menu("Assignees: \(assigneeIDs.count)") { ForEach(store.bootstrap?.members ?? []) { member in Button { if assigneeIDs.contains(member.id) { assigneeIDs.remove(member.id) } else { assigneeIDs.insert(member.id) } } label: { Label(member.displayName, systemImage: assigneeIDs.contains(member.id) ? "checkmark.circle.fill" : "circle") } } }
                    }
                    Toggle("Due date", isOn: $hasDueDate)
                    if hasDueDate { DatePicker("", selection: $dueDate).labelsHidden() }
                    HStack { Spacer(); Button("Create Task") { let title = captureTitle; Task { await store.createTask(title: title, projectID: projectID, dueDate: hasDueDate ? dueDate : nil, priority: priority, assigneeIDs: Array(assigneeIDs), estimateMinutes: estimateMinutes == 0 ? nil : estimateMinutes); dismiss() } }.buttonStyle(.borderedProminent).disabled(captureTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                }.padding(16)
            }
            if query.isEmpty && captureTitle.isEmpty {
                VStack(alignment: .leading, spacing: 8) { command("New task", shortcut: "⌘N", icon: "plus"); command("Today", shortcut: "⌘1", icon: "sun.max"); command("Refresh", shortcut: "⌘R", icon: "arrow.clockwise") }.padding(10)
            }
        }.frame(width: 560).background(.regularMaterial).onExitCommand { dismiss() }
    }
    private func command(_ title: String, shortcut: String, icon: String) -> some View { HStack { Image(systemName: icon).frame(width: 22); Text(title); Spacer(); Text(shortcut).font(.caption.monospaced()).foregroundStyle(.secondary) }.padding(8) }
}
