import Foundation
import UserNotifications

struct NotificationService: Sendable {
    func requestAuthorization() async { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) }

    func schedule(tasks: [DWTask], timer: DWTimer?, timerReminderHours: Int) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: tasks.map { "due-\($0.id)" } + ["long-timer"])
        let calendar = Calendar.current
        for task in tasks where !task.isDone {
            guard let due = task.dueDate,
                  let fire = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: due), fire > .now else { continue }
            let content = UNMutableNotificationContent()
            content.title = "Task due today"
            content.body = task.title
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(dateMatching: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire), repeats: false)
            try? await center.add(.init(identifier: "due-\(task.id)", content: content, trigger: trigger))
        }
        if let timer, timer.status == "running" {
            let remaining = max(60, timerReminderHours * 3_600 - timer.elapsed())
            let content = UNMutableNotificationContent()
            content.title = "Timer still running"
            content.body = timer.title ?? "Your Digital Workday timer has been running for a while."
            content.sound = .default
            try? await center.add(.init(identifier: "long-timer", content: content,
                                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(remaining), repeats: false)))
        }
    }

    func notifyAssignment() async {
        let content = UNMutableNotificationContent()
        content.title = "New task assigned"
        content.body = "Open Digital Workday to review your newly assigned task."
        content.sound = .default
        try? await UNUserNotificationCenter.current().add(.init(identifier: "assignment-\(UUID().uuidString)", content: content, trigger: nil))
    }
}
