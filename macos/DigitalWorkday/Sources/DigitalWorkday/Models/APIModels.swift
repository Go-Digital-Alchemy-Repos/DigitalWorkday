import Foundation

struct OAuthTokenResponse: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresIn: Int
    let sessionId: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case sessionId = "session_id"
    }
}

struct StoredCredentials: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let accessExpiresAt: Date
    let sessionId: String
}

struct APIErrorEnvelope: Codable, Sendable {
    struct Detail: Codable, Sendable {
        let code: String?
        let message: String?
        let status: Int?
    }
    let error: Detail?
    let message: String?
}

enum APIError: LocalizedError, Equatable {
    case invalidResponse
    case unauthorized
    case conflict(String)
    case server(Int, String)
    case offline

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "The server returned an invalid response."
        case .unauthorized: "Your Digital Workday session has expired."
        case .conflict(let message): message
        case .server(_, let message): message
        case .offline: "Connect to the internet to make changes."
        }
    }
}

enum APIEnvironment: String, Identifiable, Sendable {
    case production

    var id: String { rawValue }
    var baseURL: URL {
        URL(string: "https://digitalworkday.ai")!
    }

    static let defaultEnvironment: APIEnvironment = .production
}

enum JSONCoding {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let value = fractional.date(from: string) { return value }
            let standard = ISO8601DateFormatter()
            if let value = standard.date(from: string) { return value }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO-8601 date")
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
