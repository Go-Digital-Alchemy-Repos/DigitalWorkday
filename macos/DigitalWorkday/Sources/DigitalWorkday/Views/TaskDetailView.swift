import SwiftUI

struct TaskDetailView: View {
    @Environment(AppStore.self) private var store
    let detail: DWTaskDetail
    private let originalDescription: String
    private let initialDisplayDescription: String
    @State private var title: String
    @State private var description: String
    @State private var projectID: String?
    @State private var status: String
    @State private var priority: String
    @State private var dueDate: Date
    @State private var hasDueDate: Bool
    @State private var comment = ""
    @State private var subtask = ""
    @State private var timeMinutes = 30
    @State private var timeNote = ""

    init(detail: DWTaskDetail) {
        self.detail = detail
        let rawDescription = detail.task.description ?? ""
        let displayDescription = RichTextPlainText.displayText(from: rawDescription)
        originalDescription = rawDescription
        initialDisplayDescription = displayDescription
        _title = State(initialValue: detail.task.title)
        _description = State(initialValue: displayDescription)
        _projectID = State(initialValue: detail.task.projectId)
        _status = State(initialValue: detail.task.status)
        _priority = State(initialValue: detail.task.priority)
        _dueDate = State(initialValue: detail.task.dueDate ?? .now)
        _hasDueDate = State(initialValue: detail.task.dueDate != nil)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                TextField("Task title", text: $title).font(.title2.bold()).textFieldStyle(.plain)
                HStack {
                    Picker("Status", selection: $status) { ForEach(TaskStatus.allCases) { Text($0.label).tag($0.rawValue) } }
                    Picker("Priority", selection: $priority) { ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) } }
                }
                Picker("Project", selection: $projectID) {
                    Text("Personal").tag(String?.none)
                    ForEach(store.bootstrap?.projects ?? []) { project in
                        Text(project.clientName.map { "\($0) — \(project.name)" } ?? project.name).tag(Optional(project.id))
                    }
                }
                TextEditor(text: $description).frame(minHeight: 90).overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator))
                Toggle("Due date", isOn: $hasDueDate)
                if hasDueDate { DatePicker("", selection: $dueDate, displayedComponents: [.date, .hourAndMinute]).labelsHidden() }
                context
                timerControls
                Divider()
                subtasks
                Divider()
                comments
                Divider()
                timeEntry
            }.padding(22)
        }
        .toolbar {
            ToolbarItemGroup {
                Link(destination: URL(string: "https://digitalworkday.ai/my-tasks?task=\(detail.task.id)")!) { Label("Open in Web", systemImage: "safari") }
                Button("Save") { Task {
                    let descriptionToSave = description == initialDisplayDescription ? originalDescription : description
                    await store.updateTask(detail.task, title: title, description: descriptionToSave, status: status,
                                           priority: priority, dueDate: hasDueDate ? dueDate : nil, projectID: projectID)
                } }
                    .buttonStyle(.borderedProminent).disabled(!store.connectivity.isOnline)
            }
        }
        .id(detail.task.updatedAt)
    }

    private var context: some View {
        let project = store.bootstrap?.projects.first { $0.id == projectID }
        return HStack {
            Label(project?.name ?? "Personal", systemImage: project == nil ? "person" : "folder")
            if let client = project?.clientName { Text("· \(client)") }
        }.font(.callout).foregroundStyle(.secondary)
    }

    private var timerControls: some View {
        HStack {
            if let timer = store.bootstrap?.activeTimer {
                Image(systemName: "timer"); TimelineView(.periodic(from: .now, by: 1)) { _ in Text(DurationFormatter.short(timer.elapsed())).monospacedDigit() }
                Button(timer.status == "running" ? "Pause" : "Resume") { Task { await store.timer(action: timer.status == "running" ? "pause" : "resume") } }
                Button("Stop") { Task { await store.timer(action: "stop") } }
            } else {
                Button("Start Timer", systemImage: "play.fill") { Task { await store.timer(action: "start", task: detail.task) } }
            }
        }.disabled(!store.connectivity.isOnline)
    }

    private var subtasks: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Subtasks").font(.headline)
            ForEach(detail.task.subtasks) { item in Label(item.title, systemImage: item.completed ? "checkmark.circle.fill" : "circle") }
            HStack { TextField("Add a subtask", text: $subtask); Button("Add") {
                let value = subtask; subtask = ""; Task { await store.addSubtask(taskID: detail.task.id, title: value) }
            }.disabled(subtask.isEmpty || !store.connectivity.isOnline) }
        }
    }

    private var comments: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Comments").font(.headline)
            ForEach(detail.comments) { item in
                VStack(alignment: .leading, spacing: 3) { Text(item.user?.name ?? item.user?.email ?? "User").font(.caption.bold()); Text(item.body); Text(item.createdAt, style: .relative).font(.caption2).foregroundStyle(.secondary) }
                    .padding(8).background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
            }
            HStack { TextField("Write a comment", text: $comment); Button("Send") {
                let value = comment; comment = ""; Task { await store.addComment(taskID: detail.task.id, body: value) }
            }.disabled(comment.isEmpty || !store.connectivity.isOnline) }
        }
    }

    private var timeEntry: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Log Time").font(.headline)
            HStack { Stepper("\(timeMinutes) min", value: $timeMinutes, in: 5...480, step: 5); TextField("Note", text: $timeNote); Button("Log") {
                Task { await store.logTime(task: detail.task, minutes: timeMinutes, description: timeNote); timeNote = "" }
            }.disabled(!store.connectivity.isOnline) }
        }
    }
}
