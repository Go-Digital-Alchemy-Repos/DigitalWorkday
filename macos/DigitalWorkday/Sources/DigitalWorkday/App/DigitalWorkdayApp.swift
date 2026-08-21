import AppKit
import SwiftUI

@main
struct DigitalWorkdayApp: App {
    @State private var store = AppStore()
    @State private var updater = UpdaterController()
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("alwaysOnTop") private var alwaysOnTop = false
    @AppStorage("appearanceMode") private var appearanceMode = AppearanceMode.system.rawValue

    private var preferredScheme: ColorScheme? { AppearanceMode(rawValue: appearanceMode)?.colorScheme }

    var body: some Scene {
        WindowGroup("Digital Workday", id: "tasks") {
            ContentView()
                .environment(store)
                .tint(DWDesign.accent)
                .preferredColorScheme(preferredScheme)
                .background(WindowPinningView(isPinned: alwaysOnTop))
                .frame(minWidth: 620, idealWidth: 1180, minHeight: 560, idealHeight: 760)
                .task { await store.start() }
                .onChange(of: scenePhase) { _, phase in
                    Task {
                        switch phase {
                        case .active:
                            await store.setActivityState("active")
                            await store.refresh()
                        case .inactive, .background:
                            await store.setActivityState("hidden")
                        @unknown default:
                            break
                        }
                    }
                }
        }
        .defaultSize(width: 1180, height: 760)
        .windowResizability(.contentMinSize)
        .commands {
            CommandMenu("Tasks") {
                Button("Command Bar") { NotificationCenter.default.post(name: .dwCommandBar, object: nil) }
                    .keyboardShortcut("k")
                Button("New Task") { NotificationCenter.default.post(name: .dwNewTask, object: nil) }
                    .keyboardShortcut("n")
                Button("Save Task") { NotificationCenter.default.post(name: .dwSaveTask, object: nil) }
                    .keyboardShortcut("s")
                Divider()
                Button("Refresh") { NotificationCenter.default.post(name: .dwRefresh, object: nil) }
                    .keyboardShortcut("r")
            }
        }

        MenuBarExtra {
            MenuBarView()
                .environment(store)
                .tint(DWDesign.accent)
                .preferredColorScheme(preferredScheme)
        } label: {
            if store.bootstrap?.activeTimer == nil {
                MenuBarSymbol()
            } else {
                Image(systemName: "timer")
            }
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(updater: updater)
                .environment(store)
                .tint(DWDesign.accent)
                .preferredColorScheme(preferredScheme)
        }
    }
}

private struct MenuBarSymbol: View {
    private let image: NSImage? = {
        guard let url = Bundle.main.url(forResource: "menuBarSymbol", withExtension: "svg"),
              let image = NSImage(contentsOf: url) else { return nil }
        image.size = NSSize(width: 18, height: 18)
        image.isTemplate = true
        return image
    }()

    var body: some View {
        if let image {
            Image(nsImage: image)
                .renderingMode(.template)
                .frame(width: 18, height: 18)
                .accessibilityLabel("Digital Workday")
        } else {
            Image(systemName: "checkmark.circle")
        }
    }
}
