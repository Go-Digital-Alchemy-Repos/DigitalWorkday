import Foundation

enum TaskGrouping {
    static func grouped(_ tasks: [DWTask], calendar: Calendar = .current, now: Date = .now) -> [(TaskGroup, [DWTask])] {
        let start = calendar.startOfDay(for: now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: start)!
        var values: [TaskGroup: [DWTask]] = Dictionary(uniqueKeysWithValues: TaskGroup.allCases.map { ($0, []) })

        for task in tasks {
            if task.isDone {
                values[.completed, default: []].append(task)
                continue
            }
            guard let dueDate = task.dueDate else {
                values[task.isPersonal ? .personal : .noDate, default: []].append(task)
                continue
            }
            if dueDate < start {
                values[.overdue, default: []].append(task)
            } else if dueDate < tomorrow {
                values[.today, default: []].append(task)
            } else {
                values[.upcoming, default: []].append(task)
            }
        }

        return TaskGroup.allCases.compactMap { group in
            let tasks = values[group, default: []].sorted {
                ($0.dueDate ?? .distantFuture, $0.title.localizedLowercase) <
                ($1.dueDate ?? .distantFuture, $1.title.localizedLowercase)
            }
            return tasks.isEmpty ? nil : (group, tasks)
        }
    }

    static func sorted(_ tasks: [DWTask], by option: TaskSortOption) -> [DWTask] {
        tasks.sorted { left, right in
            switch option {
            case .dueDate:
                return (left.dueDate ?? .distantFuture, left.title.localizedLowercase) <
                    (right.dueDate ?? .distantFuture, right.title.localizedLowercase)
            case .priority:
                let rank = ["urgent": 0, "high": 1, "medium": 2, "low": 3]
                return (rank[left.priority] ?? 4, left.dueDate ?? .distantFuture, left.title.localizedLowercase) <
                    (rank[right.priority] ?? 4, right.dueDate ?? .distantFuture, right.title.localizedLowercase)
            case .title:
                return left.title.localizedCaseInsensitiveCompare(right.title) == .orderedAscending
            }
        }
    }

    static func labeledGroups(_ tasks: [DWTask], groupBy: TaskGroupOption,
                              sortBy: TaskSortOption, calendar: Calendar = .current,
                              now: Date = .now) -> [(String, [DWTask])] {
        if groupBy == .project {
            let values = Dictionary(grouping: tasks) { $0.projectName ?? "Personal" }
            return values.keys.sorted().map { key in (key, sorted(values[key, default: []], by: sortBy)) }
        }
        return grouped(tasks, calendar: calendar, now: now).map { ($0.0.rawValue, sorted($0.1, by: sortBy)) }
    }
}

enum TaskSelection {
    static func preferredID(current: String?, prioritized: [String?], visibleTasks: [DWTask]) -> String? {
        let visibleIDs = Set(visibleTasks.map(\.id))
        let candidates = [current] + prioritized
        return candidates.compactMap { $0 }.first(where: visibleIDs.contains) ?? visibleTasks.first?.id
    }
}

enum DurationFormatter {
    static func short(_ seconds: Int) -> String {
        let hours = seconds / 3_600
        let minutes = (seconds % 3_600) / 60
        let remaining = seconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, remaining)
            : String(format: "%02d:%02d", minutes, remaining)
    }

    static func compact(_ seconds: Int) -> String {
        let hours = seconds / 3_600
        let minutes = (seconds % 3_600) / 60
        if hours > 0 { return minutes > 0 ? "\(hours)h \(minutes)m" : "\(hours)h" }
        return "\(minutes)m"
    }
}
