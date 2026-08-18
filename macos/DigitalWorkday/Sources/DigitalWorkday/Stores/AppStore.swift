import Foundation
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

    var bootstrap: DWBootstrap?
    var selectedTaskID: String?
    var taskDetail: DWTaskDetail?
    var isLoading = false
    var isStale = false
    var errorMessage: String?
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
                                tasks: DWTaskPage(items: allTasks, nextCursor: nil), activeTimer: value.activeTimer)
            bootstrap = value; isStale = false; errorMessage = nil
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
            if let id = selectedTaskID { await selectTask(id) }
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
        guard connectivity.isOnline else { taskDetail = tasks.first(where: { $0.id == id }).map { .init(task: $0, comments: []) }; return }
        do { taskDetail = try await api.taskDetail(id) } catch { errorMessage = error.localizedDescription }
    }

    func createTask(title: String, projectID: String?) async {
        guard await canMutate() else { return }
        do {
            if let projectID { try await api.mutate("/api/v1/desktop/tasks", body: try json(["title": title, "projectId": projectID])) }
            else { try await api.mutate("/api/v1/desktop/tasks/personal", body: try json(["title": title])) }
            await refresh()
        } catch { errorMessage = error.localizedDescription }
    }

    func updateTask(_ task: DWTask, title: String, description: String, status: String, priority: String, dueDate: Date?, projectID: String? = nil) async {
        guard await canMutate() else { return }
        var body: [String: Any] = ["title": title, "description": description, "status": status,
                                   "priority": priority, "isPersonal": projectID == nil,
                                   "projectId": projectID ?? NSNull(),
                                   "expectedUpdatedAt": ISO8601DateFormatter().string(from: task.updatedAt)]
        if projectID != task.projectId { body["sectionId"] = NSNull() }
        body["dueDate"] = dueDate.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull()
        do { try await api.mutate("/api/v1/desktop/tasks/\(task.id)", method: "PATCH", body: try json(body)); await refresh() }
        catch APIError.conflict { errorMessage = "This task changed online. The current version has been reloaded."; await refresh() }
        catch { errorMessage = error.localizedDescription }
    }

    func complete(_ task: DWTask) async {
        await updateTask(task, title: task.title, description: task.description ?? "", status: "done", priority: task.priority,
                         dueDate: task.dueDate, projectID: task.projectId)
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
