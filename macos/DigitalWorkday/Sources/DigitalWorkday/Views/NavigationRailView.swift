import SwiftUI

struct NavigationRailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(spacing: 10) {
            BrandLogoView(size: 46)
                .shadow(color: theme.isEditorial ? .clear : .black.opacity(0.12), radius: 5, y: 2)
                .padding(.bottom, 8)

            ForEach(AppDestination.allCases) { destination in
                Button { withAnimation(.snappy(duration: 0.22)) { store.destination = destination } } label: {
                    VStack(spacing: 5) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: destination.systemImage).font(.system(size: 19, weight: .medium))
                            if destination == .notifications, store.unreadNotificationCount > 0 {
                                Text("\(min(store.unreadNotificationCount, 99))")
                                    .font(.system(size: 8, weight: .bold)).foregroundStyle(theme.navigation)
                                    .padding(3).background(.white, in: Circle()).offset(x: 8, y: -7)
                            }
                        }
                        Text(destination.label)
                            .font(.system(size: 10, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                            .allowsTightening(true)
                    }
                    .foregroundStyle(theme.navigationForeground)
                    .frame(width: 76, height: 60)
                    .contentShape(Rectangle())
                    .background(store.destination == destination ? .white.opacity(0.17) : .clear,
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(destination.label)
            }

            Spacer()
            if let user = store.bootstrap?.user { AvatarView(user: user, size: 34) }
            Button { openSettings() } label: {
                Image(systemName: "gearshape").font(.title3).frame(width: 46, height: 42).contentShape(Rectangle())
            }.buttonStyle(.plain).help("Profile & Settings")
        }
        .foregroundStyle(theme.navigationForeground)
        .padding(.vertical, 14)
        .frame(width: DWDesign.railWidth)
        .background(theme.navigation)
    }
}

struct CompactNavigationBar: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dwTheme) private var theme
    var body: some View {
        HStack {
            ForEach(AppDestination.allCases) { destination in
                Button { store.destination = destination } label: {
                    Label(destination.label, systemImage: destination.systemImage)
                        .labelStyle(.iconOnly).frame(maxWidth: .infinity).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(store.destination == destination ? theme.emphasis : .secondary)
            }
        }.padding(.horizontal, 12).frame(height: 44).background(.bar)
    }
}
