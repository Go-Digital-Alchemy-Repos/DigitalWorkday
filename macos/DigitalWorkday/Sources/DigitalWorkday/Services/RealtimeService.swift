import Foundation
import SocketIO

@MainActor
final class RealtimeService {
    private var manager: SocketManager?

    func connect(baseURL: URL, accessToken: String, workspaceID: String, projectIDs: [String],
                 onChange: @escaping @MainActor () -> Void,
                 onAssignment: @escaping @MainActor () -> Void) {
        disconnect()
        let manager = SocketManager(socketURL: baseURL, config: [
            .log(false), .compress, .reconnects(true), .extraHeaders(["Authorization": "Bearer \(accessToken)"])
        ])
        let socket = manager.defaultSocket
        ["task:created", "task:updated", "task:deleted", "myTask:created", "myTask:updated", "myTask:deleted",
         "timer:started", "timer:paused", "timer:resumed", "timer:stopped", "timeEntry:created"].forEach { event in
            socket.on(event) { _, _ in Task { @MainActor in onChange() } }
        }
        socket.on("myTask:created") { _, _ in Task { @MainActor in onAssignment() } }
        socket.on(clientEvent: .connect) { _, _ in
            socket.emit("room:join:workspace", ["workspaceId": workspaceID])
            projectIDs.forEach { socket.emit("room:join:project", ["projectId": $0]) }
        }
        socket.on(clientEvent: .reconnect) { _, _ in Task { @MainActor in onChange() } }
        self.manager = manager
        socket.connect()
    }

    func disconnect() { manager?.disconnect(); manager = nil }
}
