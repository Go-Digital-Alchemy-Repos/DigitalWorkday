import Foundation

enum AvatarRequestPolicy {
    static func resolvedURL(_ value: String?, relativeTo baseURL: URL) -> URL? {
        guard let value, !value.isEmpty else { return nil }
        if let path = proxyPath(value) {
            return URL(string: path, relativeTo: baseURL)?.absoluteURL
        }
        let candidate: URL?
        if let url = URL(string: value), url.scheme != nil {
            candidate = url
        } else {
            candidate = URL(string: value.hasPrefix("/") ? value : "/\(value)", relativeTo: baseURL)?.absoluteURL
        }
        guard let candidate, ["http", "https"].contains(candidate.scheme?.lowercased() ?? "") else { return nil }
        return candidate
    }

    static func proxyPath(_ value: String) -> String? {
        if value.hasPrefix("/api/v1/files/serve/") { return value }
        let decoded = value.removingPercentEncoding ?? value
        for prefix in ["tenants/", "system/", "global/"] {
            if decoded.hasPrefix(prefix) { return "/api/v1/files/serve/\(decoded)" }
            if let range = decoded.range(of: "/\(prefix)") {
                return "/api/v1/files/serve/\(prefix)\(decoded[range.upperBound...])"
            }
        }
        return nil
    }

    static func request(for value: String, baseURL: URL, accessToken: String) -> URLRequest? {
        guard let url = resolvedURL(value, relativeTo: baseURL) else { return nil }
        var request = URLRequest(url: url)
        if sameOrigin(url, baseURL) {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private static func sameOrigin(_ left: URL, _ right: URL) -> Bool {
        guard let leftScheme = left.scheme?.lowercased(), let rightScheme = right.scheme?.lowercased(),
              let leftHost = left.host?.lowercased(), let rightHost = right.host?.lowercased() else { return false }
        return leftScheme == rightScheme && leftHost == rightHost && effectivePort(left) == effectivePort(right)
    }

    private static func effectivePort(_ url: URL) -> Int? {
        if let port = url.port { return port }
        switch url.scheme?.lowercased() {
        case "http": return 80
        case "https": return 443
        default: return nil
        }
    }
}
