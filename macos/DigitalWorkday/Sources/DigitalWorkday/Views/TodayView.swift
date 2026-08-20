import SwiftUI

struct TodayView: View {
    @Environment(AppStore.self) private var store
    @State private var showingQuickAdd = false

    private var dashboard: DWToday? { store.today }
    private var overdue: [DWTask] { dashboard?.overdue ?? store.tasks.filter { $0.dueDate.map { $0 < Calendar.current.startOfDay(for: .now) } ?? false } }
    private var todayTasks: [DWTask] { dashboard?.today ?? store.tasks.filter { $0.dueDate.map { Calendar.current.isDateInToday($0) } ?? false } }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Today").font(.system(size: 25, weight: .bold, design: .rounded))
                        Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day().year()))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { showingQuickAdd = true } label: { Image(systemName: "plus") }
                        .buttonStyle(.borderedProminent).buttonBorderShape(.circle)
                }

                DWPanel {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("At a glance").font(.caption.bold()).foregroundStyle(.secondary)
                        HStack(spacing: 8) {
                            TodayMetric(title: "Overdue", value: "\(overdue.count)", detail: "Needs attention", color: .red)
                            TodayMetric(title: "Today", value: "\(todayTasks.count)", detail: "Due today", color: DWDesign.accent)
                            TodayMetric(title: "Tracked", value: DurationFormatter.compact(dashboard?.trackedSeconds ?? 0), detail: "Daily total", color: DWDesign.accent)
                        }
                    }
                }

                if let timer = store.bootstrap?.activeTimer { ActiveTimerCard(timer: timer) }
                AgendaPanel(tasks: dashboard?.agenda ?? todayTasks)
                taskSection("Overdue", tasks: overdue, color: .red, systemImage: "exclamationmark.triangle")
                taskSection("Today", tasks: todayTasks, color: DWDesign.accent, systemImage: "sun.max")
            }.padding(16)
        }
        .background(DWDesign.canvas)
        .sheet(isPresented: $showingQuickAdd) { QuickAddView() }
        .onReceive(NotificationCenter.default.publisher(for: .dwNewTask)) { _ in showingQuickAdd = true }
    }

    @ViewBuilder private func taskSection(_ title: String, tasks: [DWTask], color: Color, systemImage: String) -> some View {
        if !tasks.isEmpty {
            VStack(alignment: .leading, spacing: 7) {
                Label("\(title)  \(tasks.count)", systemImage: systemImage).font(.caption.bold()).foregroundStyle(color)
                VStack(spacing: 0) {
                    ForEach(tasks) { task in
                        CompactTaskRow(task: task)
                        if task.id != tasks.last?.id { Divider().padding(.leading, 42) }
                    }
                }.background(DWDesign.elevated.opacity(0.7), in: RoundedRectangle(cornerRadius: 11)).overlay { RoundedRectangle(cornerRadius: 11).stroke(DWDesign.divider) }
            }
        }
    }
}

private struct TodayMetric: View {
    let title: String; let value: String; let detail: String; let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.title3.bold()).foregroundStyle(color)
            Text(detail).font(.caption2).foregroundStyle(.tertiary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(DWDesign.subtleFill, in: RoundedRectangle(cornerRadius: 9))
    }
}

private struct AgendaPanel: View {
    let tasks: [DWTask]
    var body: some View {
        DWPanel {
            VStack(alignment: .leading, spacing: 10) {
                HStack { Text("Agenda").font(.caption.bold()); Spacer(); Image(systemName: "calendar").foregroundStyle(DWDesign.accent) }
                if tasks.isEmpty { Label("No scheduled work today", systemImage: "sparkles").font(.caption).foregroundStyle(.secondary) }
                ForEach(tasks.prefix(4)) { task in
                    HStack(spacing: 9) {
                        Text(task.dueDate?.formatted(date: .omitted, time: .shortened) ?? "All day").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 58, alignment: .leading)
                        Circle().fill(DWDesign.accent).frame(width: 6, height: 6)
                        VStack(alignment: .leading, spacing: 1) { Text(task.title).font(.caption.weight(.medium)).lineLimit(1); Text(task.projectName ?? "Personal").font(.caption2).foregroundStyle(.secondary) }
                        Spacer()
                        if let estimate = task.estimateMinutes { Text(DurationFormatter.compact(estimate * 60)).font(.caption2).foregroundStyle(.secondary) }
                    }
                }
            }
        }
    }
}

private struct ActiveTimerCard: View {
    @Environment(AppStore.self) private var store
    let timer: DWTimer
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "timer").foregroundStyle(DWDesign.accent)
            VStack(alignment: .leading, spacing: 2) { Text(timer.title ?? "Active timer").font(.caption.bold()); TimelineView(.periodic(from: .now, by: 1)) { context in Text(DurationFormatter.short(timer.elapsed(at: context.date))).font(.title3.monospacedDigit().bold()) } }
            Spacer()
            Button(timer.status == "running" ? "Pause" : "Resume", systemImage: timer.status == "running" ? "pause.fill" : "play.fill") { Task { await store.timer(action: timer.status == "running" ? "pause" : "resume") } }.buttonStyle(.bordered)
        }.padding(13).background(DWDesign.selection, in: RoundedRectangle(cornerRadius: 12)).overlay { RoundedRectangle(cornerRadius: 12).stroke(DWDesign.selectedBorder) }
    }
}

struct CompactTaskRow: View {
    @Environment(AppStore.self) private var store
    let task: DWTask
    @State private var hovering = false
    var body: some View {
        HStack(spacing: 0) {
            Button { Task { await store.complete(task) } } label: { Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle").font(.body).foregroundStyle(task.isDone ? DWDesign.accent : .secondary) }.buttonStyle(.plain)
                .frame(width: 36, height: 51)
                .contentShape(Rectangle())
                .help(task.isDone ? "Completed" : "Mark complete")
            Button {
                Task { await store.selectTask(task.id) }
            } label: {
                rowContent
            }
            .buttonStyle(.plain)
        }
        .padding(.trailing, 10)
        .frame(height: 51)
        .contentShape(Rectangle())
        .background(store.selectedTaskID == task.id ? DWDesign.selection : (hovering ? DWDesign.hover : .clear))
        .overlay(alignment: .leading) { if store.selectedTaskID == task.id { Rectangle().fill(DWDesign.accent).frame(width: 3) } }
        .onHover { hovering = $0 }
        .contextMenu {
            Button("Open Task") { Task { await store.selectTask(task.id) } }
            Divider()
            Button("Move to Today") { Task { await store.reschedule(task, to: Calendar.current.date(bySettingHour: 17, minute: 0, second: 0, of: .now) ?? .now) } }
            Button("Move to Tomorrow") { Task { await store.reschedule(task, to: Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now) } }
            Button("Move to Next Week") { Task { await store.reschedule(task, to: Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now) } }
        }
    }

    private var rowContent: some View {
        HStack(spacing: 9) {
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title).font(.system(size: 13, weight: .medium)).lineLimit(1)
                HStack(spacing: 5) {
                    Text(task.projectName ?? "Personal").lineLimit(1)
                    if let client = task.clientName { Text("· \(client)").lineLimit(1) }
                }.font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            if let member = task.assignees?.first { MemberAvatar(member: member, size: 22) }
            if let estimate = task.estimateMinutes { Label(DurationFormatter.compact(estimate * 60), systemImage: "clock").font(.caption2).foregroundStyle(.secondary).labelStyle(.titleAndIcon) }
            Image(systemName: prioritySymbol).font(.caption).foregroundStyle(priorityColor).help("\(task.priority.capitalized) priority")
            if hovering { Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
    private var prioritySymbol: String { task.priority == "urgent" ? "exclamationmark.2" : task.priority == "high" ? "flag.fill" : "flag" }
    private var priorityColor: Color { task.priority == "urgent" ? .red : task.priority == "high" ? .orange : .secondary }
}

struct MemberAvatar: View {
    @Environment(AppStore.self) private var store
    let member: DWMember; let size: CGFloat
    @State private var image: NSImage?
    var body: some View {
        Group {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size, height: size)
                    .clipped()
            }
            else { Text(member.initials).font(.system(size: size * 0.34, weight: .bold)).foregroundStyle(.white).frame(maxWidth: .infinity, maxHeight: .infinity).background(DWDesign.accent) }
        }
        .frame(width: size, height: size).clipShape(Circle()).overlay { Circle().stroke(.background, lineWidth: 1) }.accessibilityLabel(member.displayName)
        .task(id: member.avatarUrl) {
            image = await store.avatarImage(for: member.avatarUrl)?.avatarCopy(pointSize: size)
        }
    }
}

private extension DurationFormatter {
    static func compact(_ seconds: Int) -> String {
        let hours = seconds / 3600, minutes = (seconds % 3600) / 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }
}
