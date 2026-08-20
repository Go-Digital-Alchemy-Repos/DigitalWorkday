import SwiftUI

enum DWDesign {
    static let accent = Color(red: 0.01, green: 0.38, blue: 0.23)
    static let accentBright = Color(red: 0.06, green: 0.68, blue: 0.42)
    static let navigation = Color(red: 0.015, green: 0.34, blue: 0.22)
    static let selection = accent.opacity(0.10)
    static let selectedBorder = accent.opacity(0.72)
    static let elevated = Color(nsColor: .controlBackgroundColor)
    static let canvas = Color(nsColor: .windowBackgroundColor)
    static let subtleFill = Color.primary.opacity(0.035)
    static let divider = Color.primary.opacity(0.085)
    static let hover = Color.primary.opacity(0.055)
    static let cornerRadius: CGFloat = 14
    static let compactRadius: CGFloat = 9
    static let railWidth: CGFloat = 86
    static let primaryPaneWidth: CGFloat = 410
    static let sectionSpacing: CGFloat = 16
    static let contentPadding: CGFloat = 20
}

struct DWPanel<Content: View>: View {
    @ViewBuilder let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .padding(14)
            .background(DWDesign.elevated.opacity(0.72), in: RoundedRectangle(cornerRadius: DWDesign.cornerRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: DWDesign.cornerRadius, style: .continuous).stroke(DWDesign.divider) }
    }
}

struct DWSectionCard<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    init(_ title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(.primary)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DWDesign.elevated.opacity(0.38), in: RoundedRectangle(cornerRadius: DWDesign.compactRadius, style: .continuous))
        .overlay(alignment: .bottom) { Divider() }
    }
}

struct DWBadge: View {
    let text: String
    var color: Color = DWDesign.accent
    var systemImage: String?

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.11), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

extension TaskPriority {
    var color: Color {
        switch self {
        case .low: .secondary
        case .medium: .blue
        case .high: .orange
        case .urgent: .red
        }
    }
}

extension TaskStatus {
    var systemImage: String {
        switch self {
        case .todo: "circle"
        case .inProgress: "clock.arrow.circlepath"
        case .inReview: "eye.circle"
        case .blocked: "exclamationmark.octagon"
        case .done: "checkmark.circle.fill"
        }
    }
}
