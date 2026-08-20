import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(AppStore.self) private var store
    let updater: UpdaterController

    var body: some View {
        TabView {
            ProfileSettingsView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
            AppearanceSettingsView()
                .tabItem { Label("Appearance", systemImage: "paintbrush") }
            DesktopSettingsView(updater: updater)
                .tabItem { Label("Desktop", systemImage: "macwindow") }
        }
        .frame(width: 590, height: 510)
        .padding(18)
    }
}

private struct ProfileSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var showingImporter = false

    var body: some View {
        ScrollView {
            if let user = store.bootstrap?.user {
                VStack(alignment: .leading, spacing: 16) {
                    settingsHeader("Your Profile", subtitle: "Keep your Digital Workday identity current.", systemImage: "person.crop.circle")
                    DWSectionCard("Profile Picture", systemImage: "photo") {
                        HStack(spacing: 18) {
                            AvatarView(user: user, size: 88)
                            VStack(alignment: .leading, spacing: 8) {
                                Text("PNG, JPEG, WebP, or GIF · 2 MB maximum").font(.caption).foregroundStyle(.secondary)
                                HStack {
                                    Button("Choose Photo…") { showingImporter = true }.buttonStyle(.borderedProminent)
                                    if user.avatarUrl != nil {
                                        Button("Remove", role: .destructive) { Task { await store.removeAvatar() } }
                                    }
                                }
                            }
                            Spacer()
                            if store.isSavingProfile { ProgressView().controlSize(.small) }
                        }
                    }
                    DWSectionCard("Personal Information", systemImage: "person.text.rectangle") {
                        Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 12) {
                            GridRow {
                                Text("First name").foregroundStyle(.secondary)
                                TextField("First name", text: $firstName)
                            }
                            GridRow {
                                Text("Last name").foregroundStyle(.secondary)
                                TextField("Last name", text: $lastName)
                            }
                            GridRow {
                                Text("Email").foregroundStyle(.secondary)
                                Text(user.email).textSelection(.enabled)
                            }
                            GridRow {
                                Text("Role").foregroundStyle(.secondary)
                                DWBadge(text: roleLabel(user.role), color: .secondary, systemImage: "shield")
                            }
                        }
                        HStack {
                            if let message = store.profileMessage {
                                Label(message, systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(DWDesign.accent)
                            }
                            Spacer()
                            Button("Save Profile") {
                                Task { await store.updateProfile(firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                                                                 lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines)) }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                                      lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSavingProfile)
                        }
                    }
                    DWSectionCard("Security", systemImage: "lock.shield") {
                        HStack {
                            Text("Password and security settings remain protected on the web.").foregroundStyle(.secondary)
                            Spacer()
                            Link("Open Security Settings", destination: URL(string: "https://digitalworkday.ai/profile")!)
                        }
                    }
                }
                .onAppear { populate(from: user) }
                .onChange(of: user) { _, value in populate(from: value) }
            } else {
                ContentUnavailableView("Sign in to manage your profile", systemImage: "person.crop.circle.badge.questionmark")
            }
        }
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.png, .jpeg, .gif, .webP]) { result in
            do {
                let url = try result.get()
                guard url.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
                Task {
                    defer { url.stopAccessingSecurityScopedResource() }
                    do {
                        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                        guard size <= 2 * 1024 * 1024 else {
                            throw APIError.server(400, "Profile photos must be 2 MB or smaller.")
                        }
                        let type = UTType(filenameExtension: url.pathExtension)
                        await store.uploadAvatar(fileURL: url, mimeType: type?.preferredMIMEType ?? "application/octet-stream")
                    } catch {
                        store.errorMessage = error.localizedDescription
                    }
                }
            } catch { store.errorMessage = error.localizedDescription }
        }
    }

    private func populate(from user: DWUser) {
        let parts = (user.name ?? "").split(separator: " ", maxSplits: 1).map(String.init)
        firstName = user.firstName ?? parts.first ?? ""
        lastName = user.lastName ?? (parts.count > 1 ? parts[1] : "")
    }

    private func roleLabel(_ role: String) -> String {
        role.replacingOccurrences(of: "_", with: " ").split(separator: " ").map { $0.capitalized }.joined(separator: " ")
    }
}

private struct AppearanceSettingsView: View {
    @AppStorage("appearanceMode") private var appearanceMode = AppearanceMode.system.rawValue

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            settingsHeader("Appearance", subtitle: "Choose how Digital Workday looks on this Mac.", systemImage: "paintbrush")
            DWSectionCard("Color Mode", systemImage: "circle.lefthalf.filled") {
                HStack(spacing: 14) {
                    ForEach(AppearanceMode.allCases) { mode in
                        Button { appearanceMode = mode.rawValue } label: {
                            VStack(spacing: 10) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10).fill(previewBackground(for: mode)).frame(height: 110)
                                    VStack(spacing: 8) {
                                        RoundedRectangle(cornerRadius: 4).fill(previewForeground(for: mode).opacity(0.18)).frame(width: 94, height: 12)
                                        HStack(spacing: 7) {
                                            RoundedRectangle(cornerRadius: 5).fill(DWDesign.accent).frame(width: 28, height: 48)
                                            RoundedRectangle(cornerRadius: 5).fill(previewForeground(for: mode).opacity(0.1)).frame(width: 58, height: 48)
                                        }
                                    }
                                }
                                Label(mode.label, systemImage: appearanceMode == mode.rawValue ? "checkmark.circle.fill" : mode.systemImage)
                                    .fontWeight(appearanceMode == mode.rawValue ? .semibold : .regular)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity)
                            .background(appearanceMode == mode.rawValue ? DWDesign.accent.opacity(0.1) : .clear,
                                        in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(appearanceMode == mode.rawValue ? DWDesign.accent : .primary.opacity(0.1)))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Use \(mode.label) appearance")
                    }
                }
                Text("System follows your Mac automatically. This preference affects only the desktop app.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private func previewBackground(for mode: AppearanceMode) -> Color { mode == .dark ? Color.black.opacity(0.86) : Color.white }
    private func previewForeground(for mode: AppearanceMode) -> Color { mode == .dark ? .white : .black }
}

private struct DesktopSettingsView: View {
    @Environment(AppStore.self) private var store
    let updater: UpdaterController
    @AppStorage("alwaysOnTop") private var alwaysOnTop = false
    @AppStorage("launchAtLogin") private var launchAtLogin = false
    @AppStorage("timerReminderHours") private var timerReminderHours = 2

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            settingsHeader("Desktop", subtitle: "Tune Digital Workday for your workstation.", systemImage: "macwindow")
            DWSectionCard("Window & Startup", systemImage: "rectangle.on.rectangle") {
                Toggle("Always keep the task window on top", isOn: $alwaysOnTop)
                Toggle("Launch Digital Workday at login", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, value in
                        do { try LaunchAtLoginService.setEnabled(value) }
                        catch { launchAtLogin = LaunchAtLoginService.isEnabled; store.errorMessage = error.localizedDescription }
                    }
            }
            DWSectionCard("Reminders & Updates", systemImage: "bell") {
                Stepper("Long-running timer reminder: \(timerReminderHours) hours", value: $timerReminderHours, in: 1...8)
                HStack {
                    Button("Check for Updates") { updater.check() }.disabled(!updater.isConfigured)
                    if !updater.isConfigured { Text("Available in signed releases").font(.caption).foregroundStyle(.secondary) }
                }
            }
            HStack {
                Spacer()
                Button("Sign Out", role: .destructive) { Task { await store.signOut() } }
            }
            Spacer()
        }
        .onAppear { launchAtLogin = LaunchAtLoginService.isEnabled }
    }
}

private func settingsHeader(_ title: String, subtitle: String, systemImage: String) -> some View {
    HStack(spacing: 12) {
        Image(systemName: systemImage).font(.title).foregroundStyle(DWDesign.accent).frame(width: 38)
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.title2.bold())
            Text(subtitle).foregroundStyle(.secondary)
        }
    }
}
