import AppKit
import SwiftUI

struct TaskDetailView: View {
    @Environment(AppStore.self) private var store
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
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: DWDesign.sectionSpacing) {
                    taskHeader
                    overviewCard
                    sectionIndex(proxy)
                    descriptionCard.id(DetailSection.description)
                    timerCard.id(DetailSection.timer)
                    subtasksCard.id(DetailSection.subtasks)
                    commentsCard.id(DetailSection.comments)
                    timeEntryCard.id(DetailSection.time)
                }
                .padding(DWDesign.contentPadding)
                .frame(maxWidth: 920, alignment: .leading)
            }
        }
        .background(.primary.opacity(0.018))
        .toolbar { detailToolbar }
        .onReceive(NotificationCenter.default.publisher(for: .dwSaveTask)) { _ in if isDirty { save() } }
        .id(detail.task.updatedAt)
    }

    private func sectionIndex(_ proxy: ScrollViewProxy) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                sectionButton("Description", image: "text.alignleft", section: .description, proxy: proxy)
                sectionButton("Subtasks", count: detail.task.subtasks.count, image: "checklist", section: .subtasks, proxy: proxy)
                sectionButton("Comments", count: detail.comments.count, image: "bubble.left.and.bubble.right", section: .comments, proxy: proxy)
                sectionButton("Timer", image: "timer", section: .timer, proxy: proxy)
                sectionButton("Time entry", image: "clock", section: .time, proxy: proxy)
            }
        }
        .padding(5)
        .background(DWDesign.subtleFill, in: RoundedRectangle(cornerRadius: DWDesign.compactRadius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: DWDesign.compactRadius, style: .continuous).stroke(DWDesign.divider) }
    }

    private func sectionButton(_ title: String, count: Int? = nil, image: String,
                               section: DetailSection, proxy: ScrollViewProxy) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.22)) { proxy.scrollTo(section, anchor: .top) }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: image)
                Text(title)
                if let count, count > 0 {
                    Text("\(count)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                        .padding(.horizontal, 5).padding(.vertical, 2).background(.primary.opacity(0.06), in: Capsule())
                }
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 9).frame(height: 30)
            .background(DWDesign.elevated.opacity(0.72), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var taskHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                TextField("Task title", text: $title)
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .textFieldStyle(.plain)
                    .onChange(of: title) { markDirty() }
                if isDirty { DWBadge(text: "Unsaved", color: .orange, systemImage: "circle.fill") }
                else if saveState == .saved { DWBadge(text: "Saved", color: DWDesign.accent, systemImage: "checkmark") }
            }
            HStack(spacing: 8) {
                if let project = currentProject {
                    DWBadge(text: project.name, systemImage: "folder.fill")
                    if let client = project.clientName { DWBadge(text: client, color: .secondary, systemImage: "building.2") }
                } else {
                    DWBadge(text: "Personal", color: .secondary, systemImage: "person")
                }
                Text("Updated \(detail.task.updatedAt, style: .relative)")
                    .font(.caption).foregroundStyle(.tertiary)
            }
        }
    }

    private var overviewCard: some View {
        DWSectionCard("Overview", systemImage: "slider.horizontal.3") {
            Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 12) {
                GridRow {
                    fieldLabel("Status")
                    Picker("Status", selection: $status) { ForEach(TaskStatus.allCases) { Text($0.label).tag($0.rawValue) } }
                        .labelsHidden().onChange(of: status) { markDirty() }
                    fieldLabel("Priority")
                    Picker("Priority", selection: $priority) { ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) } }
                        .labelsHidden().onChange(of: priority) { markDirty() }
                }
                GridRow {
                    fieldLabel("Assignees")
                    Menu {
                        ForEach(store.bootstrap?.members ?? []) { member in
                            Button {
                                if assigneeIDs.contains(member.id) { assigneeIDs.remove(member.id) } else { assigneeIDs.insert(member.id) }
                                markDirty()
                            } label: {
                                Label(member.displayName, systemImage: assigneeIDs.contains(member.id) ? "checkmark.circle.fill" : "circle")
                            }
                        }
                    } label: {
                        HStack(spacing: -5) {
                            let selected = (store.bootstrap?.members ?? []).filter { assigneeIDs.contains($0.id) }
                            ForEach(selected.prefix(3)) { MemberAvatar(member: $0, size: 24) }
                            Text(selected.isEmpty ? "Unassigned" : selected.count == 1 ? selected[0].displayName : "\(selected.count) people").padding(.leading, selected.isEmpty ? 0 : 8)
                        }
                    }.gridCellColumns(1)
                    fieldLabel("Estimate")
                    Stepper(estimateMinutes == 0 ? "None" : DurationFormatter.short(estimateMinutes * 60), value: $estimateMinutes, in: 0...2880, step: 15)
                        .onChange(of: estimateMinutes) { markDirty() }
                }
                GridRow {
                    fieldLabel("Project")
                    Picker("Project", selection: $projectID) {
                        Text("Personal").tag(String?.none)
                        ForEach(store.bootstrap?.projects ?? []) { project in
                            Text(project.clientName.map { "\($0) — \(project.name)" } ?? project.name).tag(Optional(project.id))
                        }
                    }
                    .labelsHidden().gridCellColumns(3).onChange(of: projectID) { markDirty() }
                }
                GridRow {
                    Toggle("Due date", isOn: $hasDueDate).toggleStyle(.checkbox).onChange(of: hasDueDate) { markDirty() }
                    if hasDueDate {
                        DatePicker("Due date", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                            .labelsHidden().gridCellColumns(3).onChange(of: dueDate) { markDirty() }
                    } else {
                        Text("No due date").foregroundStyle(.secondary).gridCellColumns(3)
                    }
                }
            }
        }
    }

    private var descriptionCard: some View {
        DWSectionCard("Description", systemImage: "text.alignleft") {
            RichTextEditor(value: $richDescription, isEditable: store.connectivity.isOnline) {
                descriptionEdited = true
                markDirty()
            }
            Text("Rich text supports formatting, lists, links, paste, and standard Mac editing shortcuts.")
                .font(.caption).foregroundStyle(.tertiary)
        }
    }

    private var timerCard: some View {
        DWSectionCard("Timer", systemImage: "timer") {
            HStack(spacing: 12) {
                if let timer = store.bootstrap?.activeTimer {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text(DurationFormatter.short(timer.elapsed())).font(.title2.monospacedDigit().bold())
                    }
                    if let title = timer.title { Text(title).lineLimit(1).foregroundStyle(.secondary) }
                    Spacer()
                    Button(timer.status == "running" ? "Pause" : "Resume", systemImage: timer.status == "running" ? "pause.fill" : "play.fill") {
                        Task { await store.timer(action: timer.status == "running" ? "pause" : "resume") }
                    }
                    Button("Stop", systemImage: "stop.fill") { Task { await store.timer(action: "stop") } }
                } else {
                    Text("No timer is running").foregroundStyle(.secondary)
                    Spacer()
                    Button("Start Timer", systemImage: "play.fill") { Task { await store.timer(action: "start", task: detail.task) } }
                        .buttonStyle(.borderedProminent)
                }
            }.disabled(!store.connectivity.isOnline)
        }
    }

    private var subtasksCard: some View {
        DWSectionCard("Subtasks", systemImage: "checklist") {
            if detail.task.subtasks.isEmpty { Text("Break this task into smaller steps.").foregroundStyle(.secondary) }
            ForEach(detail.task.subtasks) { item in
                Label(item.title, systemImage: item.completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.completed ? .secondary : .primary)
            }
            HStack {
                TextField("Add a subtask", text: $subtask)
                Button("Add") {
                    let value = subtask; subtask = ""; Task { await store.addSubtask(taskID: detail.task.id, title: value) }
                }.disabled(subtask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.connectivity.isOnline)
            }
        }
    }

    private var commentsCard: some View {
        DWSectionCard("Comments", systemImage: "bubble.left.and.bubble.right") {
            if detail.comments.isEmpty { Text("No comments yet.").foregroundStyle(.secondary) }
            ForEach(detail.comments) { item in
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: "person.crop.circle.fill").font(.title3).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(item.user?.name ?? item.user?.email ?? "User").font(.caption.bold())
                            Text(item.createdAt, style: .relative).font(.caption2).foregroundStyle(.tertiary)
                        }
                        Text(RichTextPlainText.displayText(from: item.body)).textSelection(.enabled)
                    }
                }
                .padding(10).background(.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: DWDesign.compactRadius))
            }
            HStack {
                TextField("Write a comment", text: $comment)
                Button("Send", systemImage: "paperplane.fill") {
                    let value = comment; comment = ""; Task { await store.addComment(taskID: detail.task.id, body: value) }
                }.disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.connectivity.isOnline)
            }
        }
    }

    private var timeEntryCard: some View {
        DWSectionCard("Log Time", systemImage: "clock") {
            HStack {
                Stepper("\(timeMinutes) min", value: $timeMinutes, in: 5...480, step: 5).fixedSize()
                TextField("What did you work on?", text: $timeNote)
                Button("Log Time") {
                    Task { await store.logTime(task: detail.task, minutes: timeMinutes, description: timeNote); timeNote = "" }
                }.disabled(!store.connectivity.isOnline)
            }
        }
    }

    @ToolbarContentBuilder private var detailToolbar: some ToolbarContent {
        ToolbarItemGroup {
            Link(destination: URL(string: "https://digitalworkday.ai/my-tasks?task=\(detail.task.id)")!) {
                Label("Open in Web", systemImage: "safari")
            }
            Button(action: save) {
                if store.isSavingTask { ProgressView().controlSize(.small) }
                else { Label(isDirty ? "Save" : "Saved", systemImage: isDirty ? "square.and.arrow.down" : "checkmark") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!store.connectivity.isOnline || !isDirty || store.isSavingTask)
        }
    }

    private var currentProject: DWProject? { store.bootstrap?.projects.first { $0.id == projectID } }
    private func fieldLabel(_ text: String) -> some View { Text(text).font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
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

private enum SaveState { case idle, saving, saved, failed }
private enum DetailSection: Hashable { case description, timer, subtasks, comments, time }
