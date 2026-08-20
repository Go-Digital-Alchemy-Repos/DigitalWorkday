import SwiftUI

struct QuickAddView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var projectID = "personal"
    @State private var priority = "medium"
    @State private var hasDueDate = false
    @State private var dueDate = Date.now
    @State private var assigneeIDs: Set<String> = []
    @State private var estimateMinutes = 0
    @FocusState private var titleFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "plus.circle.fill").font(.title).foregroundStyle(DWDesign.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Quick Add").font(.title2.bold())
                    Text("Capture it now and keep moving.").foregroundStyle(.secondary)
                }
            }
            DWSectionCard("Task", systemImage: "checkmark.circle") {
                TextField("What needs to be done?", text: $title)
                    .textFieldStyle(.roundedBorder).focused($titleFocused)
                Picker("Context", selection: $projectID) {
                    Text("Personal").tag("personal")
                    ForEach(store.bootstrap?.projects ?? []) { project in
                        Text(project.clientName.map { "\($0) · \(project.name)" } ?? project.name).tag(project.id)
                    }
                }
                HStack {
                    Picker("Priority", selection: $priority) { ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) } }
                    Stepper(estimateMinutes == 0 ? "No estimate" : DurationFormatter.short(estimateMinutes * 60), value: $estimateMinutes, in: 0...1440, step: 15)
                }
                Toggle("Due date", isOn: $hasDueDate)
                if hasDueDate { DatePicker("Due", selection: $dueDate) }
                if projectID != "personal" {
                    Menu("Assignees: \(assigneeIDs.count)") {
                        ForEach(store.bootstrap?.members ?? []) { member in
                            Button { if assigneeIDs.contains(member.id) { assigneeIDs.remove(member.id) } else { assigneeIDs.insert(member.id) } } label: {
                                Label(member.displayName, systemImage: assigneeIDs.contains(member.id) ? "checkmark.circle.fill" : "circle")
                            }
                        }
                    }
                }
                Text(projectID == "personal" ? "This task stays in your personal list." : "Time and client context will come from the selected project.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Create Task") { create() }
                    .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.connectivity.isOnline)
            }
        }
        .padding(22).frame(width: 440)
        .onAppear { titleFocused = true }
    }

    private func create() {
        let value = title.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await store.createTask(title: value, projectID: projectID == "personal" ? nil : projectID,
                                   dueDate: hasDueDate ? dueDate : nil, priority: priority,
                                   assigneeIDs: Array(assigneeIDs), estimateMinutes: estimateMinutes == 0 ? nil : estimateMinutes)
            dismiss()
        }
    }
}
