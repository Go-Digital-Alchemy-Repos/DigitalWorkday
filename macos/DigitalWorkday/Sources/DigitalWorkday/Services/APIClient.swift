import Foundation

actor APIClient {
    private let keychain = KeychainStore()
    private let session: URLSession
    private(set) var environment: APIEnvironment
    private var credentials: StoredCredentials?
    // Actor methods can interleave while awaiting URLSession. Refresh tokens rotate
    // after one use, so every concurrent request must share the same rotation.
    private var refreshTask: Task<OAuthTokenResponse, Error>?

    init(environment: APIEnvironment = .defaultEnvironment, session: URLSession = .shared) {
        self.environment = environment
        self.session = session
        self.credentials = try? keychain.data(for: "desktop-credentials").flatMap {
            try JSONCoding.decoder.decode(StoredCredentials.self, from: $0)
        }
    }

    var isAuthenticated: Bool { credentials != nil }
    var accessToken: String? { credentials?.accessToken }

    func setEnvironment(_ value: APIEnvironment) throws {
        guard value != environment else { return }
        environment = value
        try clearCredentials()
    }

    func exchange(code: String, verifier: String, redirectURI: String) async throws {
        let body = ["grant_type": "authorization_code", "code": code, "code_verifier": verifier,
                    "client_id": "digital-workday-macos", "redirect_uri": redirectURI]
        let token: OAuthTokenResponse = try await publicRequest("/api/v1/desktop/auth/token", method: "POST", body: body)
        try store(token)
    }

    func bootstrap() async throws -> DWBootstrap { try await request("/api/v1/desktop/bootstrap") }
    func today(start: Date, end: Date) async throws -> DWToday {
        let formatter = ISO8601DateFormatter()
        let query = "start=\(formatter.string(from: start).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&end=\(formatter.string(from: end).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        return try await request("/api/v1/desktop/today?\(query)")
    }
    func commandCenter(date: Date, timeZone: TimeZone = .autoupdatingCurrent) async throws -> DWCommandCenter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let day = formatter.string(from: date)
        let encodedDay = day.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? day
        let zone = timeZone.identifier.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? timeZone.identifier
        return try await request("/api/v1/desktop/command-center?date=\(encodedDay)&timeZone=\(zone)")
    }
    func notifications(cursor: String? = nil) async throws -> DWNotificationPage {
        let value = cursor.flatMap { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) }
        return try await request("/api/v1/desktop/notifications?limit=50\(value.map { "&cursor=\($0)" } ?? "")")
    }
    func taskPage(cursor: String, status: String = "open") async throws -> DWTaskPage {
        let value = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cursor
        return try await request("/api/v1/desktop/tasks/page?status=\(status)&limit=100&cursor=\(value)")
    }
    func completedTaskPage(cursor: String? = nil) async throws -> DWTaskPage {
        let suffix = cursor.flatMap { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) }.map { "&cursor=\($0)" } ?? ""
        return try await request("/api/v1/desktop/tasks/page?status=done&limit=100\(suffix)")
    }
    func taskDetail(_ id: String) async throws -> DWTaskDetail { try await request("/api/v1/desktop/task-details/\(id)") }

    func updateProfile(firstName: String, lastName: String) async throws -> DWUser {
        let body = try JSONSerialization.data(withJSONObject: ["firstName": firstName, "lastName": lastName])
        return try await request("/api/v1/desktop/profile", method: "PATCH", body: body, idempotencyKey: UUID().uuidString)
    }

    func uploadAvatar(fileURL: URL, mimeType: String) async throws -> DWUser {
        let boundary = "DigitalWorkday-\(UUID().uuidString)"
        let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileURL.lastPathComponent)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return try await request("/api/v1/desktop/profile/avatar", method: "POST", body: body,
                                 idempotencyKey: UUID().uuidString, contentType: "multipart/form-data; boundary=\(boundary)")
    }

    func removeAvatar() async throws -> DWUser {
        try await request("/api/v1/desktop/profile/avatar", method: "DELETE", body: Data(), idempotencyKey: UUID().uuidString)
    }

    func markNotificationRead(_ id: String) async throws {
        let _: EmptyResponse = try await request("/api/v1/desktop/notifications/\(id)/read", method: "PATCH", body: Data("{}".utf8), idempotencyKey: UUID().uuidString)
    }

    func dismissNotification(_ id: String) async throws {
        let _: EmptyResponse = try await request("/api/v1/desktop/notifications/\(id)/dismiss", method: "PATCH", body: Data("{}".utf8), idempotencyKey: UUID().uuidString)
    }

    func markAllNotificationsRead() async throws {
        let _: EmptyResponse = try await request("/api/v1/desktop/notifications/mark-all-read", method: "POST", body: Data("{}".utf8), idempotencyKey: UUID().uuidString)
    }

    func heartbeatActivity(state: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["state": state])
        let _: EmptyResponse = try await request("/api/v1/desktop/activity/heartbeat", method: "POST", body: body)
    }

    nonisolated static func resolvedAvatarURL(_ value: String?, relativeTo baseURL: URL = APIEnvironment.production.baseURL) -> URL? {
        AvatarRequestPolicy.resolvedURL(value, relativeTo: baseURL)
    }

    nonisolated static func avatarProxyPath(_ value: String) -> String? {
        AvatarRequestPolicy.proxyPath(value)
    }

    nonisolated static func avatarRequest(for value: String, baseURL: URL,
                                          accessToken: String) -> URLRequest? {
        AvatarRequestPolicy.request(for: value, baseURL: baseURL, accessToken: accessToken)
    }

    func avatarData(_ value: String) async throws -> Data {
        guard credentials != nil else { throw APIError.unauthorized }
        if credentials!.accessExpiresAt <= .now.addingTimeInterval(20) { try await refresh() }
        guard let request = Self.avatarRequest(for: value, baseURL: environment.baseURL,
                                               accessToken: credentials!.accessToken) else { throw APIError.invalidResponse }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw APIError.invalidResponse }
        return data
    }

    func mutate(_ path: String, method: String = "POST", body: Data = Data("{}".utf8)) async throws {
        let _: EmptyResponse = try await request(path, method: method, body: body, idempotencyKey: UUID().uuidString)
    }

    func revoke() async {
        guard let refreshToken = credentials?.refreshToken else { return }
        let body = ["refresh_token": refreshToken]
        let _: EmptyResponse? = try? await publicRequest("/api/v1/desktop/auth/revoke", method: "POST", body: body)
        try? clearCredentials()
    }

    func clearCredentials() throws {
        credentials = nil
        try keychain.delete("desktop-credentials")
    }

    private func store(_ token: OAuthTokenResponse) throws {
        let value = StoredCredentials(accessToken: token.accessToken, refreshToken: token.refreshToken,
                                      accessExpiresAt: .now.addingTimeInterval(TimeInterval(token.expiresIn)), sessionId: token.sessionId)
        credentials = value
        try keychain.set(JSONCoding.encoder.encode(value), for: "desktop-credentials")
    }

    private func refresh() async throws {
        if let refreshTask {
            let token = try await refreshTask.value
            try store(token)
            return
        }
        guard let value = credentials else { throw APIError.unauthorized }
        let task = Task { try await requestRefreshedToken(using: value.refreshToken) }
        refreshTask = task
        defer { refreshTask = nil }
        let token = try await task.value
        try store(token)
    }

    private func requestRefreshedToken(using refreshToken: String) async throws -> OAuthTokenResponse {
        let body = ["grant_type": "refresh_token", "refresh_token": refreshToken,
                    "client_id": "digital-workday-macos"]
        return try await publicRequest("/api/v1/desktop/auth/token", method: "POST", body: body)
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil,
                                       idempotencyKey: String? = nil, contentType: String? = "application/json",
                                       retry: Bool = true) async throws -> T {
        guard credentials != nil else { throw APIError.unauthorized }
        if credentials!.accessExpiresAt <= .now.addingTimeInterval(20) { try await refresh() }
        guard let url = URL(string: path, relativeTo: environment.baseURL)?.absoluteURL else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(credentials!.accessToken)", forHTTPHeaderField: "Authorization")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401, retry { try await refresh(); return try await self.request(path, method: method, body: body, idempotencyKey: idempotencyKey, contentType: contentType, retry: false) }
        return try decode(data, response: http)
    }

    private func publicRequest<T: Decodable>(_ path: String, method: String, body: [String: Any]) async throws -> T {
        guard let url = URL(string: path, relativeTo: environment.baseURL)?.absoluteURL else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        return try decode(data, response: http)
    }

    private func decode<T: Decodable>(_ data: Data, response: HTTPURLResponse) throws -> T {
        guard (200..<300).contains(response.statusCode) else {
            let envelope = try? JSONCoding.decoder.decode(APIErrorEnvelope.self, from: data)
            let message = envelope?.error?.message ?? envelope?.message ?? HTTPURLResponse.localizedString(forStatusCode: response.statusCode)
            if response.statusCode == 401 { throw APIError.unauthorized }
            if response.statusCode == 409 { throw APIError.conflict(message) }
            throw APIError.server(response.statusCode, message)
        }
        if T.self == EmptyResponse.self { return EmptyResponse() as! T }
        return try JSONCoding.decoder.decode(T.self, from: data)
    }
}

private struct EmptyResponse: Codable, Sendable {}
