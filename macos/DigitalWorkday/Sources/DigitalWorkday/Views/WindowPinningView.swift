import AppKit
import SwiftUI

struct WindowPinningView: NSViewRepresentable {
    let isPinned: Bool
    func makeNSView(context: Context) -> NSView { NSView() }
    func updateNSView(_ view: NSView, context: Context) {
        DispatchQueue.main.async { view.window?.level = isPinned ? .floating : .normal }
    }
}
