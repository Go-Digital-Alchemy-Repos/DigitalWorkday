import AppKit
import AuthenticationServices
import CryptoKit
import Foundation

@MainActor
final class AuthenticationService: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func signIn(environment: APIEnvironment) async throws -> (code: String, verifier: String) {
        let verifier = Self.randomURLSafe(count: 64)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
        let state = Self.randomURLSafe(count: 32)
        var components = URLComponents(url: environment.baseURL.appending(path: "/desktop/authorize"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            .init(name: "client_id", value: "digital-workday-macos"),
            .init(name: "redirect_uri", value: "digitalworkday://auth/callback"),
            .init(name: "response_type", value: "code"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state),
        ]
        return try await withCheckedThrowingContinuation { continuation in
            let callback: @Sendable (URL?, (any Error)?) -> Void = { url, error in
                Task { @MainActor in
                    if let error { continuation.resume(throwing: error); return }
                    guard let values = url.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) })?.queryItems,
                          values.first(where: { $0.name == "state" })?.value == state,
                          let code = values.first(where: { $0.name == "code" })?.value else {
                        continuation.resume(throwing: APIError.invalidResponse); return
                    }
                    continuation.resume(returning: (code, verifier))
                }
            }
            let session = ASWebAuthenticationSession(url: components.url!, callbackURLScheme: "digitalworkday", completionHandler: callback)
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            guard session.start() else { continuation.resume(throwing: APIError.invalidResponse); return }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    }

    private static func randomURLSafe(count: Int) -> String {
        var data = Data(count: count)
        _ = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        return data.base64URLEncodedString()
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
