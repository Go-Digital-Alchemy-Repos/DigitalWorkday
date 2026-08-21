import Charts
import SwiftUI

struct TodayView: View {
    @Environment(AppStore.self) private var store
    @State private var showingQuickAdd = false

    private var openTasks: [DWTask] { store.tasks.filter { !$0.isDone } }
    private var fallbackGroups: [(TaskGroup, [DWTask])] { TaskGrouping.grouped(openTasks) }
    private var fallbackOverdue: [DWTask] { fallbackGroups.first(where: { $0.0 == .overdue })?.1 ?? [] }
    private var fallbackToday: [DWTask] { fallbackGroups.first(where: { $0.0 == .today })?.1 ?? [] }
    private var fallbackUpcoming: [DWTask] { fallbackGroups.first(where: { $0.0 == .upcoming })?.1 ?? [] }

    private var workload: DWCommandCenter.Workload {
        store.commandCenter?.workload ?? .init(overdue: fallbackOverdue.count,
                                               today: fallbackToday.count,
                                               upcoming: fallbackUpcoming.count)
    }

    private var trackedDays: [DWTrackedDay] {
        if let values = store.commandCenter?.trackedDays, values.count == 7 { return values }
        let formatter = DateFormatter.commandCenterDay
        return (0..<7).compactMap { offset in
            Calendar.current.date(byAdding: .day, value: offset - 6, to: .now)
        }.map { DWTrackedDay(date: formatter.string(from: $0), seconds: 0) }
    }

    private var agenda: [DWAgendaEvent] { store.commandCenter?.agenda ?? [] }

    var body: some View {
        @Bindable var store = store
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                header
                WorkloadPanel(workload: workload, selection: $store.workloadFilter)
                TrackedTimePanel(days: trackedDays,
                                 todaySeconds: store.commandCenter?.trackedTodaySeconds ?? store.today?.trackedSeconds ?? 0,
                                 weekSeconds: store.commandCenter?.trackedWeekSeconds ?? trackedDays.reduce(0) { $0 + $1.seconds },
                                 isAvailable: store.commandCenter != nil)
                AgendaTimeline(events: agenda, isAvailable: store.commandCenter != nil)
                taskControls
                taskGroups
                completedDrawer
                completedGroup
            }
            .padding(14)
        }
        .background(DWDesign.canvas)
        .sheet(isPresented: $showingQuickAdd) { QuickAddView() }
        .onReceive(NotificationCenter.default.publisher(for: .dwNewTask)) { _ in showingQuickAdd = true }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Today").font(.system(size: 25, weight: .bold, design: .rounded))
                Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day().year()))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button { showingQuickAdd = true } label: {
                Image(systemName: "plus").frame(width: 28, height: 28).contentShape(Circle())
            }
            .buttonStyle(.borderedProminent).buttonBorderShape(.circle).help("New task")
        }
    }

    private var taskControls: some View {
        @Bindable var store = store
        return VStack(spacing: 8) {
            HStack(spacing: 8) {
                HStack(spacing: 7) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Search tasks", text: $store.search).textFieldStyle(.plain)
                    if !store.search.isEmpty {
                        Button { store.search = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain).foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 10).frame(height: 32)
                .background(DWDesign.subtleFill, in: RoundedRectangle(cornerRadius: 8))

                Menu {
                    Picker("Group", selection: $store.taskGroup) {
                        ForEach(TaskGroupOption.allCases) { Text($0.label).tag($0) }
                    }
                    Picker("Sort", selection: $store.taskSort) {
                        ForEach(TaskSortOption.allCases) { Text($0.label).tag($0) }
                    }
                    Divider()
                    Picker("Priority", selection: $store.priorityFilter) {
                        Text("All Priorities").tag("all")
                        ForEach(TaskPriority.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                    Picker("Project", selection: $store.projectFilter) {
                        Text("All Projects").tag("all")
                        ForEach(store.bootstrap?.projects ?? []) { Text($0.name).tag($0.id) }
                    }
                    Picker("Client", selection: $store.clientFilter) {
                        Text("All Clients").tag("all")
                        ForEach(store.bootstrap?.clients ?? []) { Text($0.companyName).tag($0.id) }
                    }
                    Divider()
                    Button("Clear Filters") {
                        store.priorityFilter = "all"; store.projectFilter = "all"
                        store.clientFilter = "all"; store.workloadFilter = .all
                    }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease")
                        .frame(width: 28, height: 28).contentShape(Rectangle())
                }
                .menuStyle(.borderlessButton).help("Filter, group, and sort")
            }

            HStack {
                Text("Tasks").font(.headline)
                Text("\(store.filteredTasks.count)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                    .padding(.horizontal, 6).padding(.vertical, 2).background(DWDesign.subtleFill, in: Capsule())
                Spacer()
                if store.workloadFilter != .all {
                    Button("Show all") { store.workloadFilter = .all }
                        .buttonStyle(.plain).font(.caption).foregroundStyle(DWDesign.accent)
                }
            }
        }
    }

    @ViewBuilder private var taskGroups: some View {
        let groups = TaskGrouping.labeledGroups(store.filteredTasks.filter { !$0.isDone }, groupBy: store.taskGroup, sortBy: store.taskSort)
        if groups.isEmpty {
            ContentUnavailableView(store.search.isEmpty ? "All clear" : "No matching tasks",
                                   systemImage: store.search.isEmpty ? "checkmark.circle" : "magnifyingglass")
                .frame(maxWidth: .infinity).padding(.vertical, 24)
        } else {
            ForEach(groups, id: \.0) { title, tasks in TaskGroupBlock(title: title, tasks: tasks) }
        }
    }

    @ViewBuilder private var completedGroup: some View {
        let completed = TaskGrouping.sorted(store.filteredTasks.filter(\.isDone), by: store.taskSort)
        if store.showCompleted && !completed.isEmpty { TaskGroupBlock(title: "Completed", tasks: completed) }
    }

    private var completedDrawer: some View {
        Button {
            store.showCompleted.toggle()
            if store.showCompleted {
                store.statusFilter = "all"
                Task { await store.loadCompletedTasks() }
            } else { store.statusFilter = "open" }
        } label: {
            HStack {
                Label(store.showCompleted ? "Hide completed" : "Completed tasks", systemImage: "checkmark.circle")
                Spacer()
                if store.showCompleted { Text("\(store.completedTasks.count)").foregroundStyle(.secondary) }
                Image(systemName: store.showCompleted ? "chevron.up" : "chevron.down").foregroundStyle(.secondary)
            }
            .font(.caption.weight(.medium)).padding(.horizontal, 11).frame(height: 34).contentShape(Rectangle())
        }
        .buttonStyle(.plain).background(DWDesign.subtleFill, in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct WorkloadPanel: View {
    let workload: DWCommandCenter.Workload
    @Binding var selection: WorkloadFilter
    private var total: CGFloat { CGFloat(max(1, workload.overdue + workload.today + workload.upcoming)) }

    var body: some View {
        DashboardCard(title: "Workload", systemImage: "checkmark.circle") {
            HStack(spacing: 0) {
                metric("Overdue", count: workload.overdue, color: .red, filter: .overdue)
                Divider().frame(height: 38)
                metric("Today", count: workload.today, color: DWDesign.accentBright, filter: .today)
                Divider().frame(height: 38)
                metric("Upcoming", count: workload.upcoming, color: .secondary, filter: .upcoming)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(DWDesign.divider)
                    HStack(spacing: 2) {
                        segment(count: workload.overdue, totalWidth: proxy.size.width, color: .red)
                        segment(count: workload.today, totalWidth: proxy.size.width, color: DWDesign.accentBright)
                        segment(count: workload.upcoming, totalWidth: proxy.size.width, color: .secondary.opacity(0.55))
                    }
                }
            }
            .frame(height: 5).clipShape(Capsule())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Workload: \(workload.overdue) overdue, \(workload.today) today, \(workload.upcoming) upcoming")
        }
    }

    private func metric(_ title: String, count: Int, color: Color, filter: WorkloadFilter) -> some View {
        Button { selection = selection == filter ? .all : filter } label: {
            VStack(spacing: 3) {
                Text(title).font(.caption2).foregroundStyle(.secondary)
                Text("\(count)").font(.title3.monospacedDigit().bold()).foregroundStyle(color)
            }
            .frame(maxWidth: .infinity, minHeight: 48).contentShape(Rectangle())
            .background(selection == filter ? color.opacity(0.10) : .clear, in: RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain).help("Filter tasks by \(title.lowercased())")
    }

    private func segment(count: Int, totalWidth: CGFloat, color: Color) -> some View {
        Rectangle().fill(color).frame(width: count == 0 ? 0 : max(4, totalWidth * CGFloat(count) / total))
    }
}

private struct TrackedTimePanel: View {
    let days: [DWTrackedDay]
    let todaySeconds: Int
    let weekSeconds: Int
    let isAvailable: Bool
    @State private var selectedDate: String?

    var body: some View {
        DashboardCard(title: "Tracked Time", systemImage: "clock") {
            if !isAvailable {
                Label("Time data temporarily unavailable", systemImage: "wifi.exclamationmark")
                    .font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            } else {
                HStack(alignment: .bottom, spacing: 14) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Today").font(.caption2).foregroundStyle(.secondary)
                        Text(DurationFormatter.compact(todaySeconds)).font(.title2.monospacedDigit().bold())
                        Text("\(DurationFormatter.compact(weekSeconds)) in 7 days").font(.caption2).foregroundStyle(.secondary)
                    }
                    .frame(width: 96, alignment: .leading)
                    Chart(days) { day in
                        BarMark(x: .value("Day", day.date), y: .value("Seconds", max(180, day.seconds)))
                            .foregroundStyle(day.date == selectedDate ? DWDesign.accentBright : DWDesign.accent)
                            .opacity(day.seconds == 0 ? 0.22 : 1)
                            .cornerRadius(2)
                    }
                    .chartYScale(domain: 0...max(3_600, days.map(\.seconds).max() ?? 0))
                    .chartXAxis {
                        AxisMarks(values: days.map(\.date)) { value in
                            AxisValueLabel {
                                if let date = value.as(String.self) { Text(String(DateFormatter.shortDayLabel(date).prefix(1))) }
                            }
                        }
                    }
                    .chartYAxis(.hidden).chartXSelection(value: $selectedDate).frame(height: 64)
                    .accessibilityLabel("Tracked time for the last seven days")
                    .accessibilityValue(days.map { "\(DateFormatter.shortDayLabel($0.date)): \(DurationFormatter.compact($0.seconds))" }.joined(separator: ", "))
                }
                if let selectedDate, let day = days.first(where: { $0.date == selectedDate }) {
                    Text("\(DateFormatter.longDayLabel(day.date)) · \(DurationFormatter.compact(day.seconds))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct AgendaTimeline: View {
    @Environment(AppStore.self) private var store
    let events: [DWAgendaEvent]
    let isAvailable: Bool

    var body: some View {
        DashboardCard(title: "Agenda", systemImage: "paperplane") {
            if !isAvailable {
                Label("Agenda temporarily unavailable", systemImage: "wifi.exclamationmark")
                    .font(.caption).foregroundStyle(.secondary).padding(.vertical, 8)
            } else if events.isEmpty {
                Label("No scheduled work today", systemImage: "sparkles")
                    .font(.caption).foregroundStyle(.secondary).padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(events.prefix(6).enumerated()), id: \.element.id) { index, event in
                        Button {
                            guard let taskID = event.taskId else { return }
                            Task { await store.selectTask(taskID) }
                        } label: {
                            HStack(alignment: .top, spacing: 9) {
                                Text(event.allDay ? "All day" : event.start.formatted(date: .omitted, time: .shortened))
                                    .font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                                    .frame(width: 54, alignment: .leading)
                                VStack(spacing: 0) {
                                    Circle().fill(event.kind == "time_entry" ? DWDesign.accentBright : DWDesign.accent)
                                        .frame(width: 7, height: 7).padding(.top, 4)
                                    if index < min(events.count, 6) - 1 { Rectangle().fill(DWDesign.divider).frame(width: 1, height: 29) }
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(event.title).font(.caption.weight(.medium)).lineLimit(1)
                                    if let subtitle = event.subtitle { Text(subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
                                }
                                Spacer()
                                if let seconds = event.durationSeconds { Text(DurationFormatter.compact(seconds)).font(.caption2).foregroundStyle(.secondary) }
                            }
                            .frame(minHeight: 36).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain).disabled(event.taskId == nil)
                    }
                }
            }
        }
    }
}

private struct DashboardCard<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    init(title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title; self.systemImage = systemImage; self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Label(title, systemImage: systemImage).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            content
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(DWDesign.elevated.opacity(0.58), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(DWDesign.divider) }
    }
}

struct TaskGroupBlock: View {
    let title: String
    let tasks: [DWTask]
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(title).font(.caption.weight(.semibold))
                Text("\(tasks.count)").font(.caption2.monospacedDigit()).foregroundStyle(.tertiary)
                Spacer()
            }
            VStack(spacing: 0) {
                ForEach(tasks) { task in
                    CompactTaskRow(task: task)
                    if task.id != tasks.last?.id { Divider().padding(.leading, 37) }
                }
            }
            .background(DWDesign.elevated.opacity(0.48), in: RoundedRectangle(cornerRadius: 9))
            .overlay { RoundedRectangle(cornerRadius: 9).stroke(DWDesign.divider) }
        }
    }
}

struct CompactTaskRow: View {
    @Environment(AppStore.self) private var store
    let task: DWTask
    @State private var hovering = false
    var body: some View {
        HStack(spacing: 0) {
            Button { Task { await store.toggleComplete(task) } } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.body).foregroundStyle(task.isDone ? DWDesign.accent : .secondary)
                    .frame(width: 36, height: 48).contentShape(Rectangle())
            }
            .buttonStyle(.plain).help(task.isDone ? "Mark incomplete" : "Mark complete")

            Button { Task { await store.selectTask(task.id) } } label: {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(task.title).font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                        HStack(spacing: 4) {
                            Text(task.projectName ?? "Personal").lineLimit(1)
                            if let client = task.clientName { Text("· \(client)").lineLimit(1) }
                        }.font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 3)
                    if let member = task.assignees?.first { MemberAvatar(member: member, size: 21) }
                    if let estimate = task.estimateMinutes { Text(DurationFormatter.compact(estimate * 60)).font(.caption2).foregroundStyle(.secondary) }
                    if let due = task.dueDate {
                        Text(due.formatted(.dateTime.month(.abbreviated).day())).font(.caption2)
                            .foregroundStyle(due < Calendar.current.startOfDay(for: .now) && !task.isDone ? .red : .secondary)
                    }
                    Image(systemName: prioritySymbol).font(.caption2).foregroundStyle(priorityColor)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.trailing, 9).frame(height: 48).contentShape(Rectangle())
        .background(store.selectedTaskID == task.id ? DWDesign.selection : (hovering ? DWDesign.hover : .clear))
        .overlay(alignment: .leading) { if store.selectedTaskID == task.id { Rectangle().fill(DWDesign.accent).frame(width: 3) } }
        .onHover { hovering = $0 }
        .contextMenu {
            Button("Open Task") { Task { await store.selectTask(task.id) } }
            Divider()
            Button(task.isDone ? "Mark Incomplete" : "Mark Complete") { Task { await store.toggleComplete(task) } }
            Button("Move to Today") { Task { await store.reschedule(task, to: Calendar.current.date(bySettingHour: 17, minute: 0, second: 0, of: .now) ?? .now) } }
            Button("Move to Tomorrow") { Task { await store.reschedule(task, to: Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now) } }
            Button("Move to Next Week") { Task { await store.reschedule(task, to: Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now) } }
        }
    }
    private var prioritySymbol: String { task.priority == "urgent" ? "exclamationmark.2" : task.priority == "high" ? "flag.fill" : "flag" }
    private var priorityColor: Color { task.priority == "urgent" ? .red : task.priority == "high" ? .orange : .secondary }
}

struct MemberAvatar: View {
    @Environment(AppStore.self) private var store
    let member: DWMember
    let size: CGFloat
    @State private var image: NSImage?
    var body: some View {
        Group {
            if let image {
                Image(nsImage: image).resizable().aspectRatio(contentMode: .fill).frame(width: size, height: size).clipped()
            } else {
                Text(member.initials).font(.system(size: size * 0.34, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(DWDesign.accent)
            }
        }
        .frame(width: size, height: size).clipShape(Circle()).overlay { Circle().stroke(.background, lineWidth: 1) }
        .accessibilityLabel(member.displayName)
        .task(id: member.avatarUrl) { image = await store.avatarImage(for: member.avatarUrl)?.avatarCopy(pointSize: size) }
    }
}

private extension DateFormatter {
    static let commandCenterDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    static func shortDayLabel(_ value: String) -> String {
        commandCenterDay.date(from: value)?.formatted(.dateTime.weekday(.abbreviated)) ?? value
    }
    static func longDayLabel(_ value: String) -> String {
        commandCenterDay.date(from: value)?.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()) ?? value
    }
}
