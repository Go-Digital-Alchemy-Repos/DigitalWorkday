import SwiftUI

struct AvatarView: View {
    @Environment(AppStore.self) private var store
    let user: DWUser
    var size: CGFloat = 32
    @State private var image: NSImage?

    var body: some View {
        Group {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size, height: size)
                    .clipped()
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(.primary.opacity(0.12), lineWidth: 1))
        .accessibilityLabel("Profile for \(user.displayName)")
        .task(id: user.avatarUrl) {
            image = await store.avatarImage(for: user.avatarUrl)?.avatarCopy(pointSize: size)
        }
    }

    private var initials: some View {
        ZStack {
            LinearGradient(colors: [DWDesign.accent, DWDesign.accentBright], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(user.initials)
                .font(.system(size: size * 0.34, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
        }
    }
}

extension NSImage {
    /// SwiftUI Menu can consult an NSImage's intrinsic size before applying view
    /// modifiers. Give each avatar its intended point size so a source photo can
    /// never expand a menu label or its containing detail pane.
    func avatarCopy(pointSize: CGFloat) -> NSImage {
        let result = (copy() as? NSImage) ?? self
        result.size = NSSize(width: pointSize, height: pointSize)
        return result
    }
}
