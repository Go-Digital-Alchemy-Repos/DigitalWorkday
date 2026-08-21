import SwiftUI

enum AppearanceMode: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark
    case anthropic
    case huly
    case asana

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var systemImage: String {
        switch self {
        case .system: "circle.lefthalf.filled"
        case .light: "sun.max.fill"
        case .dark: "moon.stars.fill"
        case .anthropic: "book.closed.fill"
        case .huly: "sparkles"
        case .asana: "checklist"
        }
    }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        case .anthropic: .light
        case .huly: .dark
        case .asana: .light
        }
    }

    var theme: DWTheme {
        switch self {
        case .anthropic: .anthropic
        case .huly: .huly
        case .asana: .asana
        default: .standard
        }
    }
}
