import AppKit
import SwiftUI

struct BrandLogoView: View {
    var size: CGFloat

    var body: some View {
        Image(nsImage: NSApp.applicationIconImage)
            .resizable()
            .renderingMode(.original)
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityLabel("Digital Workday")
    }
}
