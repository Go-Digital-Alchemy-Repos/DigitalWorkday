import CryptoKit
import Foundation

struct EncryptedCacheService: Sendable {
    private let keychain = KeychainStore()
    private let keyAccount = "task-cache-key.v1"

    private var cacheURL: URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return root.appending(path: "Digital Workday", directoryHint: .isDirectory)
            .appending(path: "task-snapshot.v1", directoryHint: .notDirectory)
    }

    func load() throws -> DWBootstrap? {
        guard FileManager.default.fileExists(atPath: cacheURL.path) else { return nil }
        guard let keyData = try keychain.data(for: keyAccount) else { return nil }
        let sealed = try AES.GCM.SealedBox(combined: Data(contentsOf: cacheURL))
        return try JSONCoding.decoder.decode(DWBootstrap.self, from: AES.GCM.open(sealed, using: SymmetricKey(data: keyData)))
    }

    func save(_ snapshot: DWBootstrap) throws {
        let keyData: Data
        if let existing = try keychain.data(for: keyAccount) {
            keyData = existing
        } else {
            keyData = Data(SymmetricKey(size: .bits256).withUnsafeBytes(Array.init))
            try keychain.set(keyData, for: keyAccount)
        }
        let encrypted = try AES.GCM.seal(JSONCoding.encoder.encode(snapshot), using: SymmetricKey(data: keyData)).combined!
        try FileManager.default.createDirectory(at: cacheURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encrypted.write(to: cacheURL, options: .atomic)
    }

    func clear() throws {
        if FileManager.default.fileExists(atPath: cacheURL.path) { try FileManager.default.removeItem(at: cacheURL) }
        try keychain.delete(keyAccount)
    }
}
