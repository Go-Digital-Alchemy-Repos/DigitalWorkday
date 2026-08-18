import SwiftUI

struct SettingsView: View {
    @Environment(AppStore.self) private var store
    let updater: UpdaterController
    @AppStorage("alwaysOnTop") private var alwaysOnTop = false
    @AppStorage("launchAtLogin") private var launchAtLogin = false
    @AppStorage("timerReminderHours") private var timerReminderHours = 2

    var body: some View {
        Form {
            Toggle("Always keep task window on top", isOn: $alwaysOnTop)
            Toggle("Launch at login", isOn: $launchAtLogin).onChange(of: launchAtLogin) { _, value in
                do { try LaunchAtLoginService.setEnabled(value) } catch { launchAtLogin = LaunchAtLoginService.isEnabled; store.errorMessage = error.localizedDescription }
            }
            Stepper("Long timer reminder: \(timerReminderHours) hours", value: $timerReminderHours, in: 1...8)
            HStack {
                Button("Check for Updates") { updater.check() }.disabled(!updater.isConfigured)
                if !updater.isConfigured { Text("Available in signed releases").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Button("Sign Out", role: .destructive) { Task { await store.signOut() } }
            }
        }.formStyle(.grouped).padding().frame(width: 460, height: 300).onAppear { launchAtLogin = LaunchAtLoginService.isEnabled }
    }
}
