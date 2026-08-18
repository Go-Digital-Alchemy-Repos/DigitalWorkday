import AppKit
import SwiftUI

@main
struct DigitalWorkdayApp: App {
    @State private var store = AppStore()
    @State private var updater = UpdaterController()
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("alwaysOnTop") private var alwaysOnTop = false

    var body: some Scene {
        WindowGroup("Digital Workday", id: "tasks") {
            ContentView()
                .environment(store)
                .background(WindowPinningView(isPinned: alwaysOnTop))
                .frame(minWidth: 360, idealWidth: 420, minHeight: 520, idealHeight: 700)
                .task { await store.start() }
                .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await store.refresh() } } }
        }
        .defaultSize(width: 420, height: 700)
        .windowResizability(.contentMinSize)

        MenuBarExtra {
            MenuBarView()
                .environment(store)
        } label: {
            Image(systemName: store.bootstrap?.activeTimer == nil ? "checklist" : "timer")
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(updater: updater)
                .environment(store)
        }
    }
}
