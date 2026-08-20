import Foundation
import AppKit
import Observation
import OSLog

@MainActor @Observable
final class AppStore {
    private let logger = Logger(subsystem: "ai.digitalworkday.macos", category: "Sync")
    let connectivity = ConnectivityMonitor()
    private let api = APIClient()
    private let auth = AuthenticationService()
    private let cache = EncryptedCacheService()
    private let realtime = RealtimeService()
    private let notifications = NotificationService()
    private var avatarCache: [String: NSImage] = [:]

    var bootstrap: DWBootstrap?
    var selectedTaskID: String?
    var taskDetail: DWTaskDetail?
    var today: DWToday?
    var inbox: [DWNotification] = []
    var unreadNotificationCount = 0
    var destination: AppDestination = .today
    var showingCommandBar = false
    var isLoading = false
    var isStale = false
    var errorMessage: String?
    var profileMessage: String?
    var isSavingProfile = false
    var isSavingTask = false
    var search = ""
    var statusFilter = "open"
    var priorityFilter = "all"
    var projectFilter = "all"
    var clientFilter = "all"
    var environment = APIEnvironment.defaultEnvironment

    var tasks: [DWTask] { bootstrap?.tasks.items ?? [] }
    var filteredTasks: [DWTask] {
        tasks.filter { task in
            (search.isEmpty || task.title.localizedCaseInsensitiveContains(search) || (task.description?.localizedCaseInsensitiveContains(search) ?? false)) &&
            (statusFilter == "all" || (statusFilter == "open" ? !task.isDone : task.status == statusFilter)) &&
            (priorityFilter == "all" || task.priority == priorityFilter) &&
            (projectFilter == "all" || task.projectId == projectFilter) &&
            (clientFilter == "all" || task.clientId == clientFilter)
        }
    }

    func start() async {
        bootstrap = try? cache.load()
        isStale = bootstrap != nil
        destination = .today
        if let first = bootstrap?.tasks.items.first {
            await selectTask(first.id)
        }
        if await api.isAuthenticated { await refresh() }
    }

    func signIn() async {
        logger.info("Browser authentication started")
        isLoading = true; errorMessage = nil
        do {
            try await api.setEnvironment(environment)
            let result = try await auth.signIn(environment: environment)
            try await api.exchange(code: result.code, verifier: result.verifier, redirectURI: "digitalworkday://auth/callback")
            await notifications.requestAuthorization()
            await refresh()
            logger.info("Browser authentication completed")
        } catch { logger.error("Browser authentication failed"); errorMessage = error.localizedDescription }
        isLoading = false
    }

    func signOut() async {
        realtime.disconnect()
        await api.revoke()
        try? cache.clear()
        bootstrap = nil; taskDetail = nil; selectedTaskID = nil; isStale = false
    }

    func refresh() async {
        guard connectivity.isOnline else { isStale = bootstrap != nil; return }
        isLoading = bootstrap == nil
        do {
            var value = try await api.bootstrap()
            var allTasks = value.tasks.items
            var cursor = value.tasks.nextCursor
            while let next = cursor {
                let page = try await api.taskPage(cursor: next)
                allTasks.append(contentsOf: page.items)
                cursor = page.nextCursor
            }
            value = DWBootstrap(contractVersion: value.contractVersion, serverTime: value.serverTime, user: value.user,
                                workspace: value.workspace, projects: value.projects, clients: value.clients,
                                members: value.members,
                                tasks: DWTaskPage(items: allTasks, nextCursor: nil), activeTimer: value.activeTimer)
            bootstrap = value; isStale = false; errorMessage = nil
            await refreshDashboard()
            logger.info("Task snapshot refreshed; taskCount=\(value.tasks.items.count, privacy: .public)")
            try? cache.save(value)
            if let token = await api.accessToken {
                realtime.connect(baseURL: environment.baseURL, accessToken: token, workspaceID: value.workspace.id,
                                 projectIDs: value.projects.map(\.id)) { [weak self] in
                    guard let self else { return }
                    Task { await self.refreshAfterEvent() }
                } onAssignment: { [weak self] in
                    guard let self else { return }
                    Task { await self.notifications.notifyAssignment() }
                }
            }
            let hours = UserDefaults.standard.object(forKey: "timerReminderHours") as? Int ?? 2
            await notifications.schedule(tasks: value.tasks.items, timer: value.activeTimer, timerReminderHours: hours)
            let focusID = selectedTaskID
                ?? today?.overdue.first?.id
                ?? today?.today.first?.id
                ?? value.tasks.items.first?.id
            if let focusID { await selectTask(focusID) }
        } catch APIError.unauthorized {
            logger.info("Expired desktop credentials cleared")
            realtime.disconnect()
            try? await api.clearCredentials()
            try? cache.clear()
            bootstrap = nil
            taskDetail = nil
            selectedTaskID = nil
            isStale = false
            errorMessage = nil
        } catch {
            logger.error("Task snapshot refresh failed")
            errorMessage = error.localizedDescription
            isStale = bootstrap != nil
        }
        isLoading = false
    }

    private func refreshAfterEvent() async { try? await Task.sleep(for: .milliseconds(250)); await refresh() }

    func selectTask(_ id: String?) async {
        selectedTaskID = id
        guard let id else { taskDetail = nil; return }
        let snapshot = tasks.first(where: { $0.id == id }).map { DWTaskDetail(task: $0, comments: []) }
        taskDetail = snapshot
        guard connectivity.isOnline else { return }
        do {
            let detail = try await api.taskDetail(id)
            guard selectedTaskID == id else { return }
            taskDetail = detail
        } catch {
            guard selectedTaskID == id else { return }
            taskDetail = snapshot
            errorMessage = error.localizedDescription
        }
    }

    func avatarImage(for value: String?) async -> NSImage? {
        guard let value, !value.isEmpty else { return nil }
        if let cached = avatarCache[value] { return cached }
        guard let data = try? await api.avatarData(value), let image = NSImage(data: data) else { return nil }
        avatarCache[value] = image
        return image
    }

    func createTask(title: String, projectID: String?, dueDate: Date? = nil, priority: String = "medium",
                    assigneeIDs: [String] = [], estimateMinutes: Int? = nil) async {
        guard await canMutate() else { return }
        do {
            var body: [String: Any] = ["title": title, "priority": priority, "assigneeIds": assigneeIDs]
            body["dueDate"] = dueDate.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull()
            body["estimateMinutes"] = estimateMinutes ?? NSNull()
            if let projectID { body["projectId"] = projectID; try await api.mutate("/api/v1/desktop/tasks", body: try json(body)) }
            else { try await api.mutate("/api/v1/desktop/tasks/personal", body: try json(body)) }
            await refresh()
        } catch { errorMessage = error.localizedDescription }
    }

    @discardableResult
    func updateTask(_ task: DWTask, title: String, description: String, status: String, priority: String, dueDate: Date?, projectID: String? = nil,
                    assigneeIDs: [String]? = nil, estimateMinutes: Int? = nil) async -> Bool {
        guard await canMutate() else { return false }
        isSavingTask = true
        defer { isSavingTask = false }
        var body: [String: Any] = ["title": title, "description": description, "status": status,
                                   "priority": priority, "isPersonal": projectID == nil,
                                   "projectId": projectID ?? NSNull(),
                                   "expectedUpdatedAt": ISO8601DateFormatter().string(from: task.updatedAt)]
        if projectID != task.projectId { body["sectionId"] = NSNull() }
        if let assigneeIDs { body["assigneeIds"] = assigneeIDs }
        body["estimateMinutes"] = estimateMinutes ?? NSNull()
        body["dueDate"] = dueDate.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull()
        do { try await api.mutate("/api/v1/desktop/tasks/\(task.id)", method: "PATCH", body: try json(body)); await refresh(); return true }
        catch APIError.conflict { errorMessage = "This task changed online. The current version has been reloaded."; await refresh(); return false }
        catch { errorMessage = error.localizedDescription; return false }
    }

    func complete(_ task: DWTask) async {
        await updateTask(task, title: task.title, description: task.description ?? "", status: "done", priority: task.priority,
                         dueDate: task.dueDate, projectID: task.projectId)
    }

    func reschedule(_ task: DWTask, to date: Date) async {
        _ = await updateTask(task, title: task.title, description: task.description ?? "", status: task.status,
                             priority: task.priority, dueDate: date, projectID: task.projectId,
                             assigneeIDs: task.assigneeIds, estimateMinutes: task.estimateMinutes)
    }

    func refreshDashboard() async {
        guard connectivity.isOnline, bootstrap != nil else { return }
        let calendar = Calendar.autoupdatingCurrent
        let start = calendar.startOfDay(for: .now)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        do {
            async let todayValue = api.today(start: start, end: end)
            async let inboxValue = api.notifications()
            let (dashboard, notifications) = try await (todayValue, inboxValue)
            today = dashboard
            inbox = notifications.items
            unreadNotificationCount = notifications.unreadCount
        } catch { logger.error("Dashboard refresh failed: \(error.localizedDescription, privacy: .public)") }
    }

    func openNotification(_ notification: DWNotification) async {
        if notification.isUnread { try? await api.markNotificationRead(notification.id) }
        if notification.entityType == "task", let id = notification.entityId {
            destination = .tasks
            await selectTask(id)
        }
        await refreshDashboard()
    }

    func dismissNotification(_ notification: DWNotification) async {
        do { try await api.dismissNotification(notification.id); await refreshDashboard() }
        catch { errorMessage = error.localizedDescription }
    }

    func markAllNotificationsRead() async {
        do { try await api.markAllNotificationsRead(); await refreshDashboard() }
        catch { errorMessage = error.localizedDescription }
    }

    func updateProfile(firstName: String, lastName: String) async {
        guard await canMutate() else { return }
        isSavingProfile = true; profileMessage = nil
        defer { isSavingProfile = false }
        do {
            let user = try await api.updateProfile(firstName: firstName, lastName: lastName)
            replaceUser(user)
            profileMessage = "Profile saved"
        } catch { errorMessage = error.localizedDescription }
    }

    func uploadAvatar(fileURL: URL, mimeType: String) async {
        guard await canMutate() else { return }
        isSavingProfile = true; profileMessage = nil
        defer { isSavingProfile = false }
        do {
            let user = try await api.uploadAvatar(fileURL: fileURL, mimeType: mimeType)
            replaceUser(user)
            profileMessage = "Photo updated"
        } catch { errorMessage = error.localizedDescription }
    }

    func removeAvatar() async {
        guard await canMutate() else { return }
        isSavingProfile = true; profileMessage = nil
        defer { isSavingProfile = false }
        do {
            replaceUser(try await api.removeAvatar())
            profileMessage = "Photo removed"
        } catch { errorMessage = error.localizedDescription }
    }

    private func replaceUser(_ user: DWUser) {
        guard let value = bootstrap else { return }
        bootstrap = DWBootstrap(contractVersion: value.contractVersion, serverTime: value.serverTime, user: user,
                                workspace: value.workspace, projects: value.projects, clients: value.clients,
                                members: value.members,
                                tasks: value.tasks, activeTimer: value.activeTimer)
        if let bootstrap { try? cache.save(bootstrap) }
    }

    func addComment(taskID: String, body: String) async {
        guard await canMutate() else { return }
        do { try await api.mutate("/api/v1/desktop/tasks/\(taskID)/comments", body: try json(["body": body, "visibility": "internal"])); await selectTask(taskID) }
        catch { errorMessage = error.localizedDescription }
    }

    func addSubtask(taskID: String, title: String) async {
        guard await canMutate() else { return }
        do { try await api.mutate("/api/v1/desktop/tasks/\(taskID)/subtasks", body: try json(["title": title, "status": "todo", "completed": false])); await selectTask(taskID) }
        catch { errorMessage = error.localizedDescription }
    }

    func timer(action: String, task: DWTask? = nil) async {
        guard await canMutate() else { return }
        var body: [String: Any] = [:]
        if let task { body = ["taskId": task.id, "title": task.title]; if let projectID = task.projectId { body["projectId"] = projectID } }
        do { try await api.mutate("/api/v1/desktop/timer/\(action)", body: try json(body)); await refresh() }
        catch { errorMessage = error.localizedDescription }
    }

    func logTime(task: DWTask, minutes: Int, description: String) async {
        guard await canMutate() else { return }
        let start = Date().addingTimeInterval(TimeInterval(-minutes * 60))
        var body: [String: Any] = ["taskId": task.id, "description": description,
                                   "startTime": ISO8601DateFormatter().string(from: start), "durationSeconds": minutes * 60]
        if let projectID = task.projectId { body["projectId"] = projectID }
        do { try await api.mutate("/api/v1/desktop/time-entries", body: try json(body)); await refresh() }
        catch { errorMessage = error.localizedDescription }
    }

    private func canMutate() async -> Bool {
        guard connectivity.isOnline else { errorMessage = APIError.offline.localizedDescription; return false }
        return true
    }

    private func json(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object) }
}
