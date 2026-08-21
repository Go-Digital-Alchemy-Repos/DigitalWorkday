import AppKit
import SwiftUI

struct TaskDetailViewIdentity: Hashable {
    let taskID: String
    let updatedAt: Date
}

struct TaskDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    let detail: DWTaskDetail
    private let originalDescription: String

    @State private var title: String
    @State private var richDescription: NSAttributedString
    @State private var projectID: String?
    @State private var status: String
    @State private var priority: String
    @State private var assigneeIDs: Set<String>
    @State private var estimateMinutes: Int
    @State private var dueDate: Date
    @State private var hasDueDate: Bool
    @State private var comment = ""
    @State private var subtask = ""
    @State private var timeMinutes = 30
    @State private var timeNote = ""
    @State private var isDirty = false
    @State private var descriptionEdited = false
    @State private var saveState = SaveState.idle
    @State private var descriptionExpanded = true
    @State private var subtasksExpanded = true
    @State private var commentsExpanded = true
    @State private var timeExpanded = true

    init(detail: DWTaskDetail) {
        self.detail = detail
        let rawDescription = detail.task.description ?? ""
        originalDescription = rawDescription
        _title = State(initialValue: detail.task.title)
        _richDescription = State(initialValue: TipTapRichText.attributedString(from: rawDescription))
        _projectID = State(initialValue: detail.task.projectId)
        _status = State(initialValue: detail.task.status)
        _priority = State(initialValue: detail.task.priority)
        _assigneeIDs = State(initialValue: Set(detail.task.assigneeIds))
        _estimateMinutes = State(initialValue: detail.task.estimateMinutes ?? 0)
        _dueDate = State(initialValue: detail.task.dueDate ?? .now)
        _hasDueDate = State(initialValue: detail.task.dueDate != nil)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                navigationBar
                taskHeader
                metadataGrid
                DescriptionPanel(isExpanded: $descriptionExpanded, richDescription: $richDescription,
                                 isEditable: store.connectivity.isOnline) {
                    descriptionEdited = true
                    markDirty()
                }
                SubtasksPanel(isExpanded: $subtasksExpanded, items: detail.task.subtasks,
                              draft: $subtask, taskID: detail.task.id)
                CommentsPanel(isExpanded: $commentsExpanded, comments: detail.comments,
                              draft: $comment, taskID: detail.task.id)
                TimeEntriesPanel(isExpanded: $timeExpanded, entries: detail.timeEntries,
                                 task: detail.task, minutes: $timeMinutes, note: $timeNote)
            }
            .padding(18)
            .frame(maxWidth: 980, alignment: .leading)
        }
        .background(theme.detailCanvas)
        .onReceive(NotificationCenter.default.publisher(for: .dwSaveTask)) { _ in if isDirty { save() } }
    }

    private var navigationBar: some View {
        HStack(spacing: 8) {
            Button { Task { await store.selectAdjacentTask(offset: -1) } } label: {
                Image(systemName: "chevron.up").frame(width: 26, height: 24).contentShape(Rectangle())
            }.buttonStyle(.plain).help("Previous task")
            Button { Task { await store.selectAdjacentTask(offset: 1) } } label: {
                Image(systemName: "chevron.down").frame(width: 26, height: 24).contentShape(Rectangle())
            }.buttonStyle(.plain).help("Next task")
            Text(taskPosition).font(.caption).foregroundStyle(.secondary)
            Spacer()
            if isDirty { DWBadge(text: "Unsaved", color: .orange, systemImage: "circle.fill") }
            else if saveState == .saved { DWBadge(text: "Saved", systemImage: "checkmark") }
            Button(action: save) {
                if store.isSavingTask { ProgressView().controlSize(.small) }
                else { Label(isDirty ? "Save" : "Saved", systemImage: isDirty ? "square.and.arrow.down" : "checkmark") }
            }
            .dwPrimaryActionStyle()
            .disabled(!store.connectivity.isOnline || !isDirty || store.isSavingTask)
        }
        .font(.caption)
        .padding(.bottom, 7)
        .overlay(alignment: .bottom) { Divider() }
    }

    private var taskHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Button { Task { await store.toggleComplete(detail.task) } } label: {
                    Image(systemName: detail.task.isDone ? "checkmark.circle.fill" : "circle")
                        .font(.title2).foregroundStyle(detail.task.isDone ? theme.emphasis : .secondary)
                        .frame(width: 32, height: 32).contentShape(Rectangle())
                }
                .buttonStyle(.plain).help(detail.task.isDone ? "Mark incomplete" : "Mark complete")

                TextField("Task title", text: $title)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .textFieldStyle(.plain)
                    .onChange(of: title) { markDirty() }
                Spacer(minLength: 8)
                Button {
                    Task { await store.toggleComplete(detail.task) }
                } label: {
                    Image(systemName: detail.task.isDone ? "arrow.uturn.backward" : "checkmark")
                        .frame(width: 28, height: 28).contentShape(Rectangle())
                }
                .dwPrimaryActionStyle()
                .disabled(!store.connectivity.isOnline)
                .help(detail.task.isDone ? "Reopen task" : "Mark complete")
                Menu {
                    Link(destination: URL(string: "https://digitalworkday.ai/my-tasks?task=\(detail.task.id)")!) {
                        Label("Open in Web", systemImage: "safari")
                    }
                } label: {
                    Image(systemName: "ellipsis").frame(width: 28, height: 28).contentShape(Rectangle())
                }.menuStyle(.borderlessButton)
            }
            HStack(spacing: 7) {
                if let project = currentProject {
                    DWBadge(text: project.name, systemImage: "folder.fill")
                    if let client = project.clientName { DWBadge(text: client, color: .secondary, systemImage: "building.2") }
                } else { DWBadge(text: "Personal", color: .secondary, systemImage: "person") }
                Spacer()
                Text("Updated \(detail.task.updatedAt, style: .relative)").font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }

    private var metadataGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 135), spacing: 0)], alignment: .leading, spacing: 0) {
            metadataField("Assignees", systemImage: "person.2") {
                Menu {
                    let members = store.bootstrap?.members ?? []
                    if members.isEmpty {
                        Button("No available assignees") { }.disabled(true)
                    } else {
                        ForEach(members) { member in
                            Button {
                                if assigneeIDs.contains(member.id) { assigneeIDs.remove(member.id) } else { assigneeIDs.insert(member.id) }
                                markDirty()
                            } label: { Label(member.displayName, systemImage: assigneeIDs.contains(member.id) ? "checkmark.circle.fill" : "circle") }
                        }
                    }
                } label: {
                    HStack(spacing: -5) {
                        let selected = (store.bootstrap?.members ?? []).filter { assigneeIDs.contains($0.id) }
                        ForEach(selected.prefix(3)) { MemberAvatar(member: $0, size: 24) }
                        Text(selected.isEmpty ? "Unassigned" : selected.count == 1 ? selected[0].displayName : "\(selected.count) people")
                            .lineLimit(1).padding(.leading, selected.isEmpty ? 0 : 8)
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
                    .contentShape(Rectangle())
                }.menuStyle(.borderlessButton)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            metadataField("Estimate", systemImage: "clock") {
                Stepper(estimateMinutes == 0 ? "None" : DurationFormatter.compact(estimateMinutes * 60),
                        value: $estimateMinutes, in: 0...2880, step: 15)
                    .onChange(of: estimateMinutes) { markDirty() }
            }
            metadataField("Priority", systemImage: "flag") {
                Picker("Priority", selection: $priority) { ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) } }
                    .labelsHidden().onChange(of: priority) { markDirty() }
            }
            metadataField("Due", systemImage: "calendar") {
                if hasDueDate {
                    DatePicker("Due", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                        .labelsHidden().onChange(of: dueDate) { markDirty() }
                } else {
                    Button("Add date") { hasDueDate = true; markDirty() }.buttonStyle(.plain).foregroundStyle(theme.emphasis)
                }
            }
            metadataField("Status", systemImage: "circle.dotted") {
                Picker("Status", selection: $status) { ForEach(TaskStatus.allCases) { Text($0.label).tag($0.rawValue) } }
                    .labelsHidden().onChange(of: status) { markDirty() }
            }
            metadataField("Project", systemImage: "folder") {
                Picker("Project", selection: $projectID) {
                    Text("Personal").tag(String?.none)
                    ForEach(store.bootstrap?.projects ?? []) { Text($0.name).tag(Optional($0.id)) }
                }
                .labelsHidden().onChange(of: projectID) { markDirty() }
            }
            metadataField("Timer", systemImage: "timer") { TimerInlineControl(task: detail.task) }
        }
        .background(theme.elevated.opacity(theme.isEditorial ? 1 : 0.38), in: RoundedRectangle(cornerRadius: theme.isEditorial ? theme.cardRadius : 9))
        .overlay { RoundedRectangle(cornerRadius: theme.isEditorial ? theme.cardRadius : 9).stroke(theme.divider) }
    }

    private func metadataField<Content: View>(_ label: String, systemImage: String,
                                              @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(label, systemImage: systemImage).font(.caption2).foregroundStyle(.secondary)
            content().font(.caption).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(11).frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
        .overlay(alignment: .trailing) { Rectangle().fill(theme.divider).frame(width: 1) }
    }

    private var currentProject: DWProject? { store.bootstrap?.projects.first { $0.id == projectID } }
    private var taskPosition: String {
        let ordered = TaskGrouping.sorted(store.filteredTasks, by: store.taskSort)
        guard let index = ordered.firstIndex(where: { $0.id == detail.task.id }) else { return "Task" }
        return "Task \(index + 1) of \(ordered.count)"
    }
    private func markDirty() { isDirty = true; saveState = .idle }
    private func save() {
        let value = descriptionEdited ? TipTapRichText.json(from: richDescription) : originalDescription
        saveState = .saving
        Task {
            let saved = await store.updateTask(detail.task, title: title, description: value, status: status,
                                               priority: priority, dueDate: hasDueDate ? dueDate : nil, projectID: projectID,
                                               assigneeIDs: Array(assigneeIDs), estimateMinutes: estimateMinutes == 0 ? nil : estimateMinutes)
            saveState = saved ? .saved : .failed
            if saved { isDirty = false; descriptionEdited = false }
        }
    }
}

private struct DescriptionPanel: View {
    @Binding var isExpanded: Bool
    @Binding var richDescription: NSAttributedString
    let isEditable: Bool
    let onChange: () -> Void
    var body: some View {
        CollapsibleDetailPanel(title: "Description", count: nil, systemImage: "text.alignleft", isExpanded: $isExpanded) {
            RichTextEditor(value: $richDescription, isEditable: isEditable, onChange: onChange)
            Text("Rich text supports formatting, lists, links, paste, and standard Mac editing shortcuts.")
                .font(.caption2).foregroundStyle(.tertiary)
        }
    }
}

private struct SubtasksPanel: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    @Binding var isExpanded: Bool
    let items: [DWSubtask]
    @Binding var draft: String
    let taskID: String
    var body: some View {
        CollapsibleDetailPanel(title: "Subtasks", count: items.count, systemImage: "checklist", isExpanded: $isExpanded) {
            if items.isEmpty { Text("Break this task into smaller steps.").font(.caption).foregroundStyle(.secondary) }
            ForEach(items) { item in SubtaskEditorRow(item: item).id(item.updatedAt) }
            HStack {
                TextField("Add a subtask", text: $draft).textFieldStyle(.plain)
                    .onSubmit(add)
                Button("Add", action: add).buttonStyle(.bordered)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.connectivity.isOnline)
            }
            .padding(.horizontal, 9).frame(height: 34).background(theme.subtleFill, in: RoundedRectangle(cornerRadius: theme.compactRadius))
        }
    }
    private func add() {
        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        draft = ""; Task { await store.addSubtask(taskID: taskID, title: value) }
    }
}

private struct SubtaskEditorRow: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    let item: DWSubtask
    @State private var title: String
    init(item: DWSubtask) { self.item = item; _title = State(initialValue: item.title) }
    var body: some View {
        HStack(spacing: 9) {
            Button { Task { await store.updateSubtask(item, completed: !item.completed) } } label: {
                Image(systemName: item.completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.completed ? theme.emphasis : .secondary)
                    .frame(width: 26, height: 26).contentShape(Rectangle())
            }.buttonStyle(.plain)
            TextField("Subtask", text: $title).textFieldStyle(.plain).font(.caption)
                .strikethrough(item.completed).foregroundStyle(item.completed ? .secondary : .primary)
                .onSubmit { saveTitle() }
            Menu {
                Button("Save Rename", action: saveTitle)
                Button("Delete", role: .destructive) { Task { await store.deleteSubtask(item) } }
            } label: { Image(systemName: "ellipsis").frame(width: 26, height: 26).contentShape(Rectangle()) }
            .menuStyle(.borderlessButton)
        }
        .padding(.horizontal, 8).frame(height: 36)
        .background(theme.subtleFill, in: RoundedRectangle(cornerRadius: theme.compactRadius))
    }
    private func saveTitle() {
        let value = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value != item.title else { return }
        Task { await store.updateSubtask(item, title: value) }
    }
}

private struct CommentsPanel: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    @Binding var isExpanded: Bool
    let comments: [DWComment]
    @Binding var draft: String
    let taskID: String
    var body: some View {
        CollapsibleDetailPanel(title: "Comments", count: comments.count, systemImage: "bubble.left.and.bubble.right", isExpanded: $isExpanded) {
            if comments.isEmpty { Text("No comments yet.").font(.caption).foregroundStyle(.secondary) }
            ForEach(comments) { item in
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: "person.crop.circle.fill").font(.title3).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(item.user?.name ?? item.user?.email ?? "User").font(.caption.bold())
                            Text(item.createdAt, style: .relative).font(.caption2).foregroundStyle(.tertiary)
                        }
                        Text(RichTextPlainText.displayText(from: item.body)).font(.caption).textSelection(.enabled)
                    }
                }
                .padding(9).background(theme.subtleFill, in: RoundedRectangle(cornerRadius: theme.compactRadius))
            }
            HStack {
                TextField("Write a comment", text: $draft).textFieldStyle(.plain).onSubmit(send)
                Button("Send", systemImage: "paperplane.fill", action: send).labelStyle(.iconOnly).buttonStyle(.bordered)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.connectivity.isOnline)
            }
            .padding(.horizontal, 9).frame(height: 34).background(theme.subtleFill, in: RoundedRectangle(cornerRadius: theme.compactRadius))
        }
    }
    private func send() {
        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        draft = ""; Task { await store.addComment(taskID: taskID, body: value) }
    }
}

private struct TimeEntriesPanel: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    @Binding var isExpanded: Bool
    let entries: [DWTimeEntry]
    let task: DWTask
    @Binding var minutes: Int
    @Binding var note: String
    private var total: Int { entries.reduce(0) { $0 + $1.durationSeconds } }
    var body: some View {
        CollapsibleDetailPanel(title: "Time Entries", count: entries.count, systemImage: "clock", trailing: DurationFormatter.compact(total), isExpanded: $isExpanded) {
            if entries.isEmpty { Text("No time has been logged for this task.").font(.caption).foregroundStyle(.secondary) }
            ForEach(entries) { entry in TimeEntryRow(entry: entry) }
            HStack {
                Stepper("\(minutes) min", value: $minutes, in: 5...480, step: 5).fixedSize().font(.caption)
                TextField("What did you work on?", text: $note).textFieldStyle(.plain)
                Button("Log", systemImage: "plus") {
                    let value = note; note = ""
                    Task { await store.logTime(task: task, minutes: minutes, description: value) }
                }
                .dwPrimaryActionStyle().disabled(!store.connectivity.isOnline)
            }
            .padding(.horizontal, 9).frame(height: 38).background(theme.subtleFill, in: RoundedRectangle(cornerRadius: theme.compactRadius))
        }
    }
}

private struct TimeEntryRow: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    let entry: DWTimeEntry
    @State private var editing = false
    var body: some View {
        HStack(spacing: 10) {
            Text(entry.startTime.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(.secondary).frame(width: 112, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.displayTitle).font(.caption.weight(.medium)).lineLimit(1)
                Text(entry.isManual ? "Manual entry" : "Timer entry").font(.caption2).foregroundStyle(.tertiary)
            }
            Spacer()
            Text(DurationFormatter.compact(entry.durationSeconds)).font(.caption.monospacedDigit())
            Menu {
                Button("Edit") { editing = true }
                Button("Delete", role: .destructive) { Task { await store.deleteTimeEntry(entry) } }
            } label: { Image(systemName: "ellipsis").frame(width: 26, height: 26).contentShape(Rectangle()) }
            .menuStyle(.borderlessButton)
        }
        .padding(.horizontal, 8).frame(height: 42).background(theme.subtleFill, in: RoundedRectangle(cornerRadius: theme.compactRadius))
        .sheet(isPresented: $editing) { EditTimeEntrySheet(entry: entry) }
    }
}

private struct EditTimeEntrySheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let entry: DWTimeEntry
    @State private var minutes: Int
    @State private var description: String
    init(entry: DWTimeEntry) {
        self.entry = entry
        _minutes = State(initialValue: max(1, entry.durationSeconds / 60))
        _description = State(initialValue: entry.description ?? entry.title ?? "")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Edit Time Entry").font(.title2.bold())
            TextField("Description", text: $description)
            Stepper("Duration: \(minutes) minutes", value: $minutes, in: 1...720, step: 5)
            HStack { Spacer(); Button("Cancel") { dismiss() }; Button("Save") { Task { await store.updateTimeEntry(entry, minutes: minutes, description: description); dismiss() } }.dwPrimaryActionStyle() }
        }
        .padding(22).frame(width: 420)
    }
}

private struct TimerInlineControl: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    let task: DWTask
    var body: some View {
        if let timer = store.bootstrap?.activeTimer {
            HStack(spacing: 6) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(DurationFormatter.short(timer.elapsed(at: context.date))).monospacedDigit()
                }
                Button { Task { await store.timer(action: timer.status == "running" ? "pause" : "resume") } } label: {
                    Image(systemName: timer.status == "running" ? "pause.fill" : "play.fill").frame(width: 24, height: 24).contentShape(Rectangle())
                }.buttonStyle(.plain)
            }
        } else {
            Button("Start", systemImage: "play.fill") { Task { await store.timer(action: "start", task: task) } }
                .buttonStyle(.plain).foregroundStyle(theme.emphasis)
        }
    }
}

private struct CollapsibleDetailPanel<Content: View>: View {
    @Environment(\.dwTheme) private var theme
    let title: String
    let count: Int?
    let systemImage: String
    var trailing: String?
    @Binding var isExpanded: Bool
    @ViewBuilder let content: Content

    init(title: String, count: Int?, systemImage: String, trailing: String? = nil,
         isExpanded: Binding<Bool>, @ViewBuilder content: () -> Content) {
        self.title = title; self.count = count; self.systemImage = systemImage
        self.trailing = trailing; _isExpanded = isExpanded; self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.snappy(duration: 0.18)) { isExpanded.toggle() } } label: {
                HStack(spacing: 8) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right").font(.caption2).foregroundStyle(.secondary)
                    Label(title, systemImage: systemImage).font(.subheadline.weight(.semibold))
                    if let count { Text("\(count)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary).padding(.horizontal, 6).padding(.vertical, 2).background(theme.subtleFill, in: Capsule()) }
                    Spacer()
                    if let trailing { Text(trailing).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                }
                .padding(.horizontal, 12).frame(height: 40).contentShape(Rectangle())
            }.buttonStyle(.plain)
            if isExpanded {
                VStack(alignment: .leading, spacing: 9) { content }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .top) { Divider() }
            }
        }
        .background(theme.elevated.opacity(theme.isEditorial ? 1 : 0.42), in: RoundedRectangle(cornerRadius: theme.isEditorial ? theme.cardRadius : 9))
        .overlay { RoundedRectangle(cornerRadius: theme.isEditorial ? theme.cardRadius : 9).stroke(theme.divider) }
    }
}

private enum SaveState { case idle, saving, saved, failed }
