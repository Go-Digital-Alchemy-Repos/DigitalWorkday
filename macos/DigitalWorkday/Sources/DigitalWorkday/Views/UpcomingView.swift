import SwiftUI

struct UpcomingView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    private var groups: [(Date, [DWTask])] {
        let calendar = Calendar.autoupdatingCurrent
        return Dictionary(grouping: store.filteredTasks.filter { $0.dueDate.map { !calendar.isDateInToday($0) && $0 >= calendar.startOfDay(for: .now) } ?? false }) {
            calendar.startOfDay(for: $0.dueDate!)
        }.sorted { $0.key < $1.key }.map { ($0.key, $0.value.sorted { ($0.dueDate ?? .distantFuture) < ($1.dueDate ?? .distantFuture) }) }
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                Text("Upcoming").font(.system(size: 25, weight: .bold, design: .rounded))
                if groups.isEmpty { ContentUnavailableView("Nothing upcoming", systemImage: "calendar.badge.checkmark", description: Text("Your future work will appear here.")) }
                ForEach(groups, id: \.0) { date, tasks in
                    VStack(alignment: .leading, spacing: 7) {
                        Text(date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())).font(.caption.bold()).foregroundStyle(.secondary)
                        VStack(spacing: 0) { ForEach(tasks) { task in CompactTaskRow(task: task); if task.id != tasks.last?.id { Divider().padding(.leading, 40) } } }
                            .background(theme.elevated, in: RoundedRectangle(cornerRadius: theme.cardRadius)).overlay { RoundedRectangle(cornerRadius: theme.cardRadius).stroke(theme.divider) }
                    }
                }
            }.padding(16)
        }.background(theme.canvas)
    }
}
