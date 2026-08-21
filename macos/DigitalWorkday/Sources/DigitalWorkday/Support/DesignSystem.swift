import SwiftUI

enum DWDesign {
    static let railWidth: CGFloat = 86
    static let primaryPaneWidth: CGFloat = 460
    static let sectionSpacing: CGFloat = 16
    static let contentPadding: CGFloat = 20
}

struct DWTheme: Equatable {
    let id: String
    let isEditorial: Bool
    let action: Color
    let actionPressed: Color
    let actionForeground: Color
    let emphasis: Color
    let emphasisBright: Color
    let navigation: Color
    let navigationForeground: Color
    let selection: Color
    let selectedBorder: Color
    let elevated: Color
    let canvas: Color
    let detailCanvas: Color
    let subtleFill: Color
    let divider: Color
    let hover: Color
    let mutedText: Color
    let cardRadius: CGFloat
    let compactRadius: CGFloat

    static let standard = DWTheme(
        id: "standard",
        isEditorial: false,
        action: Color(red: 0.01, green: 0.38, blue: 0.23),
        actionPressed: Color(red: 0.008, green: 0.31, blue: 0.19),
        actionForeground: .white,
        emphasis: Color(red: 0.01, green: 0.38, blue: 0.23),
        emphasisBright: Color(red: 0.06, green: 0.68, blue: 0.42),
        navigation: Color(red: 0.015, green: 0.34, blue: 0.22),
        navigationForeground: .white,
        selection: Color(red: 0.01, green: 0.38, blue: 0.23).opacity(0.10),
        selectedBorder: Color(red: 0.01, green: 0.38, blue: 0.23).opacity(0.72),
        elevated: Color(nsColor: .controlBackgroundColor),
        canvas: Color(nsColor: .windowBackgroundColor),
        detailCanvas: Color.primary.opacity(0.018),
        subtleFill: Color.primary.opacity(0.035),
        divider: Color.primary.opacity(0.085),
        hover: Color.primary.opacity(0.055),
        mutedText: .secondary,
        cardRadius: 14,
        compactRadius: 9
    )

    static let anthropic = DWTheme(
        id: "anthropic",
        isEditorial: true,
        action: Color(red: 0xD9 / 255, green: 0x77 / 255, blue: 0x57 / 255),
        actionPressed: Color(red: 0xC6 / 255, green: 0x61 / 255, blue: 0x3F / 255),
        actionForeground: Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x13 / 255),
        emphasis: Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x13 / 255),
        emphasisBright: Color(red: 0x3D / 255, green: 0x3D / 255, blue: 0x3A / 255),
        navigation: Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x13 / 255),
        navigationForeground: Color(red: 0xFA / 255, green: 0xF9 / 255, blue: 0xF5 / 255),
        selection: Color(red: 0xE3 / 255, green: 0xDA / 255, blue: 0xCC / 255),
        selectedBorder: Color(red: 0x87 / 255, green: 0x86 / 255, blue: 0x7F / 255),
        elevated: Color(red: 0xFA / 255, green: 0xF9 / 255, blue: 0xF5 / 255),
        canvas: Color(red: 0xF0 / 255, green: 0xEE / 255, blue: 0xE6 / 255),
        detailCanvas: Color(red: 0xF5 / 255, green: 0xE3 / 255, blue: 0xC7 / 255).opacity(0.34),
        subtleFill: Color(red: 0xE3 / 255, green: 0xDA / 255, blue: 0xCC / 255).opacity(0.72),
        divider: Color(red: 0xCC / 255, green: 0xCB / 255, blue: 0xC8 / 255),
        hover: Color(red: 0xE3 / 255, green: 0xDA / 255, blue: 0xCC / 255).opacity(0.82),
        mutedText: Color(red: 0x3D / 255, green: 0x3D / 255, blue: 0x3A / 255),
        cardRadius: 24,
        compactRadius: 12
    )

    static let asana = DWTheme(
        id: "asana",
        isEditorial: true,
        action: Color(red: 0x0D / 255, green: 0x0D / 255, blue: 0x0D / 255),
        actionPressed: Color(red: 0x71 / 255, green: 0x0C / 255, blue: 0x3A / 255),
        actionForeground: .white,
        emphasis: Color(red: 0x22 / 255, green: 0x28 / 255, blue: 0x75 / 255),
        emphasisBright: Color(red: 0xFF / 255, green: 0x58 / 255, blue: 0x4A / 255),
        navigation: Color(red: 0xF3 / 255, green: 0xF3 / 255, blue: 0xF3 / 255),
        navigationForeground: Color(red: 0x0D / 255, green: 0x0D / 255, blue: 0x0D / 255),
        selection: Color(red: 0xFF / 255, green: 0xEA / 255, blue: 0xEC / 255),
        selectedBorder: Color(red: 0x69 / 255, green: 0x00 / 255, blue: 0x31 / 255),
        elevated: .white,
        canvas: .white,
        detailCanvas: Color(red: 0xF3 / 255, green: 0xF3 / 255, blue: 0xF3 / 255).opacity(0.7),
        subtleFill: Color(red: 0xF3 / 255, green: 0xF3 / 255, blue: 0xF3 / 255),
        divider: Color(red: 0xE7 / 255, green: 0xE7 / 255, blue: 0xE7 / 255),
        hover: Color(red: 0xFF / 255, green: 0xEA / 255, blue: 0xEC / 255).opacity(0.72),
        mutedText: Color(red: 0x6E / 255, green: 0x6E / 255, blue: 0x6E / 255),
        cardRadius: 12,
        compactRadius: 4
    )

    static let huly = DWTheme(
        id: "huly",
        isEditorial: true,
        action: Color(red: 0x56 / 255, green: 0x83 / 255, blue: 0xDA / 255),
        actionPressed: Color(red: 0x45 / 255, green: 0x6F / 255, blue: 0xC0 / 255),
        actionForeground: Color(red: 0x09 / 255, green: 0x0A / 255, blue: 0x0C / 255),
        emphasis: Color(red: 0x56 / 255, green: 0x83 / 255, blue: 0xDA / 255),
        emphasisBright: Color(red: 0xFF / 255, green: 0x89 / 255, blue: 0x64 / 255),
        navigation: Color(red: 0x09 / 255, green: 0x0A / 255, blue: 0x0C / 255),
        navigationForeground: Color(red: 0xD1 / 255, green: 0xD1 / 255, blue: 0xD1 / 255),
        selection: Color(red: 0x56 / 255, green: 0x83 / 255, blue: 0xDA / 255).opacity(0.18),
        selectedBorder: Color(red: 0x56 / 255, green: 0x83 / 255, blue: 0xDA / 255),
        elevated: Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x11 / 255),
        canvas: Color(red: 0x30 / 255, green: 0x32 / 255, blue: 0x36 / 255),
        detailCanvas: Color(red: 0x09 / 255, green: 0x0A / 255, blue: 0x0C / 255),
        subtleFill: Color(red: 0x4A / 255, green: 0x4B / 255, blue: 0x50 / 255),
        divider: Color(red: 0x4A / 255, green: 0x4B / 255, blue: 0x50 / 255),
        hover: Color(red: 0x56 / 255, green: 0x83 / 255, blue: 0xDA / 255).opacity(0.14),
        mutedText: Color(red: 0xA9 / 255, green: 0xA9 / 255, blue: 0xAA / 255),
        cardRadius: 12,
        compactRadius: 4
    )

    func contentFont(_ style: Font.TextStyle, weight: Font.Weight? = nil) -> Font {
        let font = Font.system(style, design: id == "anthropic" ? .serif : .default)
        return weight.map { font.weight($0) } ?? font
    }
}

private struct DWThemeEnvironmentKey: EnvironmentKey {
    static let defaultValue = DWTheme.standard
}

extension EnvironmentValues {
    var dwTheme: DWTheme {
        get { self[DWThemeEnvironmentKey.self] }
        set { self[DWThemeEnvironmentKey.self] = newValue }
    }
}

private struct AnthropicPrimaryButtonStyle: ButtonStyle {
    @Environment(\.dwTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: .default).weight(.medium))
            .foregroundStyle(theme.actionForeground)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                configuration.isPressed ? theme.actionPressed : theme.action,
                in: UnevenRoundedRectangle(
                    topLeadingRadius: 0,
                    bottomLeadingRadius: 8,
                    bottomTrailingRadius: 8,
                    topTrailingRadius: 0,
                    style: .continuous
                )
            )
            .opacity(isEnabled ? 1 : 0.48)
    }
}

private struct ThemedPrimaryButtonStyle: ButtonStyle {
    @Environment(\.dwTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: .default).weight(.medium))
            .foregroundStyle(theme.actionForeground)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(configuration.isPressed ? theme.actionPressed : theme.action, in: Capsule())
            .opacity(isEnabled ? 1 : 0.48)
    }
}

private struct DWPrimaryActionModifier: ViewModifier {
    @Environment(\.dwTheme) private var theme

    @ViewBuilder
    func body(content: Content) -> some View {
        if theme.id == "anthropic" {
            content.buttonStyle(AnthropicPrimaryButtonStyle())
        } else if theme.isEditorial {
            content.buttonStyle(ThemedPrimaryButtonStyle())
        } else {
            content.buttonStyle(.borderedProminent)
        }
    }
}

extension View {
    func dwPrimaryActionStyle() -> some View {
        modifier(DWPrimaryActionModifier())
    }
}

struct DWPanel<Content: View>: View {
    @Environment(\.dwTheme) private var theme
    @ViewBuilder let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .padding(14)
            .background(theme.elevated.opacity(theme.isEditorial ? 1 : 0.72), in: RoundedRectangle(cornerRadius: theme.cardRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: theme.cardRadius, style: .continuous).stroke(theme.divider) }
    }
}

struct DWSectionCard<Content: View>: View {
    @Environment(\.dwTheme) private var theme
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
                .font(theme.contentFont(.headline, weight: .semibold))
                .foregroundStyle(.primary)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.elevated.opacity(theme.isEditorial ? 1 : 0.38), in: RoundedRectangle(cornerRadius: theme.isEditorial ? theme.cardRadius : theme.compactRadius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: theme.isEditorial ? theme.cardRadius : theme.compactRadius, style: .continuous).stroke(theme.divider) }
    }
}

struct DWBadge: View {
    @Environment(\.dwTheme) private var theme
    let text: String
    var color: Color?
    var systemImage: String?

    init(text: String, color: Color? = nil, systemImage: String? = nil) {
        self.text = text
        self.color = color
        self.systemImage = systemImage
    }

    var body: some View {
        let resolvedColor = color ?? theme.emphasis
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(resolvedColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(resolvedColor.opacity(0.11), in: Capsule())
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
