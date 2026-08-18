import Foundation

enum TaskGrouping {
    static func grouped(_ tasks: [DWTask], calendar: Calendar = .current, now: Date = .now) -> [(TaskGroup, [DWTask])] {
        let start = calendar.startOfDay(for: now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: start)!
        var values: [TaskGroup: [DWTask]] = Dictionary(uniqueKeysWithValues: TaskGroup.allCases.map { ($0, []) })

        for task in tasks where !task.isDone {
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
}
