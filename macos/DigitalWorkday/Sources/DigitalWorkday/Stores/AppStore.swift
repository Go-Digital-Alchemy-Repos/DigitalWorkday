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
    private var activityHeartbeatTask: Task<Void, Never>?
    private var activityIdleTask: Task<Void, Never>?
    private var activityEventMonitor: Any?
    private var activityState = "active"

    var bootstrap: DWBootstrap?
    var selectedTaskID: String?
    var taskDetail: DWTaskDetail?
    var today: DWToday?
    var commandCenter: DWCommandCenter?
    var completedTasks: [DWTask] = []
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
    var taskSort: TaskSortOption = .dueDate
    var taskGroup: TaskGroupOption = .dueDate
    var workloadFilter: WorkloadFilter = .all
    var showCompleted = false
    var environment = APIEnvironment.defaultEnvironment

    var tasks: [DWTask] { bootstrap?.tasks.items ?? [] }
    var visibleTasks: [DWTask] { tasks + (showCompleted ? completedTasks : []) }
    var filteredTasks: [DWTask] {
        visibleTasks.filter { task in
            (search.isEmpty || task.title.localizedCaseInsensitiveContains(search) || (task.description?.localizedCaseInsensitiveContains(search) ?? false)) &&
            (statusFilter == "all" || (statusFilter == "open" ? !task.isDone : task.status == statusFilter)) &&
            (priorityFilter == "all" || task.priority == priorityFilter) &&
            (projectFilter == "all" || task.projectId == projectFilter) &&
            (clientFilter == "all" || task.clientId == clientFilter)
            && matchesWorkloadFilter(task)
        }
    }

    func start() async {
        bootstrap = try? cache.load()
        isStale = bootstrap != nil
        destination = .today
        if let first = bootstrap?.tasks.items.first {
            await selectTask(first.id)
        }
        if await api.isAuthenticated {
            startActivityHeartbeat()
            installActivityMonitor()
            await setActivityState("active")
            await refresh()
        }
    }

    func signIn() async {
        logger.info("Browser authentication started")
        isLoading = true; errorMessage = nil
        do {
            try await api.setEnvironment(environment)
            let result = try await auth.signIn(environment: environment)
            try await api.exchange(code: result.code, verifier: result.verifier, redirectURI: "digitalworkday://auth/callback")
            startActivityHeartbeat()
            installActivityMonitor()
            await setActivityState("active")
            await notifications.requestAuthorization()
            await refresh()
            logger.info("Browser authentication completed")
        } catch { logger.error("Browser authentication failed"); errorMessage = error.localizedDescription }
        isLoading = false
    }

    func signOut() async {
        activityHeartbeatTask?.cancel()
        activityHeartbeatTask = nil
        activityIdleTask?.cancel()
        activityIdleTask = nil
        if let activityEventMonitor { NSEvent.removeMonitor(activityEventMonitor) }
        activityEventMonitor = nil
        realtime.disconnect()
        await api.revoke()
        try? cache.clear()
        bootstrap = nil; taskDetail = nil; selectedTaskID = nil; commandCenter = nil
        completedTasks = []; isStale = false
    }

    func setActivityState(_ state: String) async {
        activityState = state
        if state == "active" { scheduleIdleTransition() }
        else { activityIdleTask?.cancel(); activityIdleTask = nil }
        await sendActivityHeartbeat()
    }

    private func startActivityHeartbeat() {
        activityHeartbeatTask?.cancel()
        activityHeartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled, let self else { return }
                await self.sendActivityHeartbeat()
            }
        }
    }

    private func sendActivityHeartbeat() async {
        guard await api.isAuthenticated else { return }
        try? await api.heartbeatActivity(state: activityState)
    }

    private func installActivityMonitor() {
        guard activityEventMonitor == nil else { return }
        let events: NSEvent.EventTypeMask = [
            .keyDown, .flagsChanged, .leftMouseDown, .rightMouseDown, .otherMouseDown,
            .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged, .scrollWheel,
        ]
        activityEventMonitor = NSEvent.addLocalMonitorForEvents(matching: events) { [weak self] event in
            Task { @MainActor in self?.recordUserActivity() }
            return event
        }
    }

    private func recordUserActivity() {
        guard activityState != "hidden" else { return }
        let resumedFromIdle = activityState == "idle"
        activityState = "active"
        scheduleIdleTransition()
        if resumedFromIdle { Task { await sendActivityHeartbeat() } }
    }

    private func scheduleIdleTransition() {
        activityIdleTask?.cancel()
        activityIdleTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(300))
            guard !Task.isCancelled, let self, self.activityState == "active" else { return }
            self.activityState = "idle"
            await self.sendActivityHeartbeat()
        }
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
            if showCompleted { await loadCompletedTasks() }
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
            let focusID = TaskSelection.preferredID(
                current: selectedTaskID,
                prioritized: [today?.overdue.first?.id, today?.today.first?.id],
                visibleTasks: visibleTasks
            )
            await selectTask(focusID)
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
        let snapshot = visibleTasks.first(where: { $0.id == id }).map { DWTaskDetail(task: $0, comments: [], timeEntries: []) }
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
                                   "expectedUpdatedAt": JSONCoding.iso8601String(from: task.updatedAt)]
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
                         dueDate: task.dueDate, projectID: task.projectId, estimateMinutes: task.estimateMinutes)
    }

    func toggleComplete(_ task: DWTask) async {
        _ = await updateTask(task, title: task.title, description: task.description ?? "",
                             status: task.isDone ? "todo" : "done", priority: task.priority,
                             dueDate: task.dueDate, projectID: task.projectId,
                             assigneeIDs: task.assigneeIds, estimateMinutes: task.estimateMinutes)
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
        async let todayValue = try? api.today(start: start, end: end)
        async let commandCenterValue = try? api.commandCenter(date: start)
        async let inboxValue = try? api.notifications()
        let (dashboard, center, notifications) = await (todayValue, commandCenterValue, inboxValue)
        if let dashboard { today = dashboard }
        commandCenter = center
        if let notifications {
            inbox = notifications.items
            unreadNotificationCount = notifications.unreadCount
        }
    }

    func loadCompletedTasks() async {
        guard connectivity.isOnline else { return }
        do {
            var page = try await api.completedTaskPage()
            var values = page.items
            while let cursor = page.nextCursor {
                page = try await api.completedTaskPage(cursor: cursor)
                values.append(contentsOf: page.items)
            }
            completedTasks = values
        } catch { errorMessage = error.localizedDescription }
    }

    func selectAdjacentTask(offset: Int) async {
        let ordered = TaskGrouping.sorted(filteredTasks, by: taskSort)
        guard !ordered.isEmpty else { return }
        let index = selectedTaskID.flatMap { id in ordered.firstIndex(where: { $0.id == id }) } ?? 0
        let destination = min(max(index + offset, 0), ordered.count - 1)
        await selectTask(ordered[destination].id)
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

    func updateSubtask(_ item: DWSubtask, title: String? = nil, completed: Bool? = nil) async {
        guard await canMutate() else { return }
        var body: [String: Any] = [:]
        if let title { body["title"] = title }
        if let completed {
            body["completed"] = completed
            body["status"] = completed ? "done" : "todo"
        }
        do { try await api.mutate("/api/v1/desktop/subtasks/\(item.id)", method: "PATCH", body: try json(body)); await selectTask(item.taskId) }
        catch { errorMessage = error.localizedDescription }
    }

    func deleteSubtask(_ item: DWSubtask) async {
        guard await canMutate() else { return }
        do { try await api.mutate("/api/v1/desktop/subtasks/\(item.id)", method: "DELETE", body: Data()); await selectTask(item.taskId) }
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
        do {
            try await api.mutate("/api/v1/desktop/time-entries", body: try json(body))
            await refreshDashboard()
            await selectTask(task.id)
        }
        catch { errorMessage = error.localizedDescription }
    }


    func updateTimeEntry(_ entry: DWTimeEntry, minutes: Int, description: String) async {
        guard await canMutate() else { return }
        let body: [String: Any] = ["durationSeconds": max(60, minutes * 60), "description": description]
        do {
            try await api.mutate("/api/v1/desktop/time-entries/\(entry.id)", method: "PATCH", body: try json(body))
            await refreshDashboard()
            await selectTask(entry.taskId)
        } catch { errorMessage = error.localizedDescription }
    }

    func deleteTimeEntry(_ entry: DWTimeEntry) async {
        guard await canMutate() else { return }
        do {
            try await api.mutate("/api/v1/desktop/time-entries/\(entry.id)", method: "DELETE", body: Data())
            await refreshDashboard()
            await selectTask(entry.taskId)
        } catch { errorMessage = error.localizedDescription }
    }

    private func matchesWorkloadFilter(_ task: DWTask) -> Bool {
        guard workloadFilter != .all else { return true }
        guard let due = task.dueDate, !task.isDone else { return false }
        let calendar = Calendar.autoupdatingCurrent
        let start = calendar.startOfDay(for: .now)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        switch workloadFilter {
        case .all: return true
        case .overdue: return due < start
        case .today: return due >= start && due < end
        case .upcoming: return due >= end
        }
    }

    private func canMutate() async -> Bool {
        guard connectivity.isOnline else { errorMessage = APIError.offline.localizedDescription; return false }
        return true
    }

    private func json(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object) }
}
