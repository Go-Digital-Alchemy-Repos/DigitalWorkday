import Foundation

struct DWUser: Codable, Equatable, Sendable {
    let id: String
    let name: String?
    let email: String
    let role: String
    let avatarUrl: String?
}

struct DWWorkspace: Codable, Equatable, Sendable {
    let id: String
    let name: String
}

struct DWClient: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let companyName: String
}

struct DWProject: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let clientId: String?
    let clientName: String?
}

struct DWSubtask: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let taskId: String
    let title: String
    let status: String
    let completed: Bool
    let dueDate: Date?
    let updatedAt: Date
}

struct DWTask: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var title: String
    var description: String?
    var status: String
    var priority: String
    var dueDate: Date?
    let isPersonal: Bool
    let projectId: String?
    let projectName: String?
    let clientId: String?
    let clientName: String?
    let sectionId: String?
    let assigneeIds: [String]
    var subtasks: [DWSubtask]
    let createdAt: Date
    var updatedAt: Date

    var isDone: Bool { status == "done" || status == "completed" }
}

struct DWTimer: Codable, Equatable, Sendable {
    let id: String
    let taskId: String?
    let projectId: String?
    let clientId: String?
    let title: String?
    let description: String?
    let status: String
    let elapsedSeconds: Int
    let lastStartedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    func elapsed(at date: Date = .now) -> Int {
        guard status == "running", let lastStartedAt else { return elapsedSeconds }
        return elapsedSeconds + max(0, Int(date.timeIntervalSince(lastStartedAt)))
    }
}

struct DWTaskPage: Codable, Equatable, Sendable {
    let items: [DWTask]
    let nextCursor: String?
}

struct DWBootstrap: Codable, Equatable, Sendable {
    let contractVersion: Int
    let serverTime: Date
    let user: DWUser
    let workspace: DWWorkspace
    let projects: [DWProject]
    let clients: [DWClient]
    let tasks: DWTaskPage
    let activeTimer: DWTimer?
}

struct DWComment: Codable, Identifiable, Hashable, Sendable {
    struct Author: Codable, Hashable, Sendable {
        let id: String
        let name: String?
        let email: String
        let avatarUrl: String?
    }

    let id: String
    let taskId: String?
    let body: String
    let visibility: String
    let createdAt: Date
    let updatedAt: Date
    let user: Author?
}

struct DWTaskDetail: Codable, Equatable, Sendable {
    let task: DWTask
    let comments: [DWComment]
}

enum TaskStatus: String, CaseIterable, Identifiable, Codable, Sendable {
    case todo
    case inProgress = "in_progress"
    case inReview = "in_review"
    case blocked
    case done

    var id: String { rawValue }
    var label: String {
        switch self {
        case .todo: "To Do"
        case .inProgress: "In Progress"
        case .inReview: "In Review"
        case .blocked: "Blocked"
        case .done: "Done"
        }
    }
}

enum TaskPriority: String, CaseIterable, Identifiable, Codable, Sendable {
    case low, medium, high, urgent
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

enum TaskGroup: String, CaseIterable, Identifiable, Sendable {
    case overdue = "Overdue"
    case today = "Today"
    case upcoming = "Upcoming"
    case personal = "Personal"
    case noDate = "No Due Date"
    var id: String { rawValue }
}
