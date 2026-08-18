import Foundation

actor APIClient {
    private let keychain = KeychainStore()
    private let session: URLSession
    private(set) var environment: APIEnvironment
    private var credentials: StoredCredentials?

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
    func taskPage(cursor: String) async throws -> DWTaskPage {
        let value = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cursor
        return try await request("/api/v1/desktop/tasks/page?status=open&limit=100&cursor=\(value)")
    }
    func taskDetail(_ id: String) async throws -> DWTaskDetail { try await request("/api/v1/desktop/task-details/\(id)") }

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
        guard let value = credentials else { throw APIError.unauthorized }
        let body = ["grant_type": "refresh_token", "refresh_token": value.refreshToken,
                    "client_id": "digital-workday-macos"]
        let token: OAuthTokenResponse = try await publicRequest("/api/v1/desktop/auth/token", method: "POST", body: body)
        try store(token)
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil,
                                       idempotencyKey: String? = nil, retry: Bool = true) async throws -> T {
        guard credentials != nil else { throw APIError.unauthorized }
        if credentials!.accessExpiresAt <= .now.addingTimeInterval(20) { try await refresh() }
        guard let url = URL(string: path, relativeTo: environment.baseURL)?.absoluteURL else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(credentials!.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401, retry { try await refresh(); return try await self.request(path, method: method, body: body, idempotencyKey: idempotencyKey, retry: false) }
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
