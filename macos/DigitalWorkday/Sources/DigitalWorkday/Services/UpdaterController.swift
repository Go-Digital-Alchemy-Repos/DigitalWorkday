import Sparkle

@MainActor
final class UpdaterController {
    let isConfigured: Bool
    let controller: SPUStandardUpdaterController

    init() {
        let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String
        isConfigured = key != nil && key != "SPARKLE_PUBLIC_KEY_REQUIRED_FOR_RELEASE"
        controller = SPUStandardUpdaterController(startingUpdater: isConfigured, updaterDelegate: nil, userDriverDelegate: nil)
    }

    func check() {
        guard isConfigured else { return }
        controller.checkForUpdates(nil)
    }
}
