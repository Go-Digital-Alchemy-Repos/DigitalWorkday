import AppKit
import SwiftUI

struct RichTextEditor: View {
    @Environment(\.dwTheme) private var theme
    @Binding var value: NSAttributedString
    let isEditable: Bool
    let onChange: () -> Void
    @State private var controller = RichTextController()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 2) {
                editorButton("Bold", systemImage: "bold", action: controller.toggleBold)
                editorButton("Italic", systemImage: "italic", action: controller.toggleItalic)
                editorButton("Underline", systemImage: "underline", action: controller.toggleUnderline)
                Divider().frame(height: 18).padding(.horizontal, 4)
                editorButton("Bulleted List", systemImage: "list.bullet", action: { controller.toggleList(ordered: false) })
                editorButton("Numbered List", systemImage: "list.number", action: { controller.toggleList(ordered: true) })
                editorButton("Add Link", systemImage: "link", action: controller.addLink)
                Spacer()
                editorButton("Undo", systemImage: "arrow.uturn.backward", action: controller.undo)
                editorButton("Redo", systemImage: "arrow.uturn.forward", action: controller.redo)
            }
            .padding(.horizontal, 8)
            .frame(height: 36)
            .background(.primary.opacity(0.035))

            Divider()

            RichTextViewRepresentable(value: $value, isEditable: isEditable, controller: controller, onChange: onChange)
                .frame(minHeight: 150)
        }
        .background(theme.elevated.opacity(0.45), in: RoundedRectangle(cornerRadius: theme.compactRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: theme.compactRadius, style: .continuous)
                .stroke(.primary.opacity(0.12), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: theme.compactRadius, style: .continuous))
    }

    private func editorButton(_ help: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: systemImage).frame(width: 24, height: 24) }
            .buttonStyle(.plain)
            .contentShape(Rectangle())
            .help(help)
            .disabled(!isEditable)
    }
}

@MainActor
private final class RichTextController {
    weak var textView: NSTextView?

    func toggleBold() { toggleTrait(.boldFontMask) }
    func toggleItalic() { toggleTrait(.italicFontMask) }
    func toggleUnderline() { textView?.underline(nil) }
    func undo() { textView?.undoManager?.undo() }
    func redo() { textView?.undoManager?.redo() }

    private func toggleTrait(_ trait: NSFontTraitMask) {
        guard let textView else { return }
        let selection = textView.selectedRange()
        let currentFont = (selection.length > 0 ? textView.textStorage?.attribute(.font, at: selection.location, effectiveRange: nil) : textView.typingAttributes[.font]) as? NSFont
            ?? NSFont.preferredFont(forTextStyle: .body)
        let hasTrait = (trait == .boldFontMask && currentFont.fontDescriptor.symbolicTraits.contains(.bold)) ||
            (trait == .italicFontMask && currentFont.fontDescriptor.symbolicTraits.contains(.italic))
        let converted = hasTrait ? NSFontManager.shared.convert(currentFont, toNotHaveTrait: trait) : NSFontManager.shared.convert(currentFont, toHaveTrait: trait)
        if selection.length == 0 {
            textView.typingAttributes[.font] = converted
        } else {
            textView.textStorage?.addAttribute(.font, value: converted, range: selection)
            textView.didChangeText()
        }
    }

    func toggleList(ordered: Bool) {
        guard let textView else { return }
        let source = textView.string as NSString
        let selected = textView.selectedRange()
        let range = source.paragraphRange(for: selected)
        let paragraphs = source.substring(with: range).split(separator: "\n", omittingEmptySubsequences: false)
        let alreadyFormatted = paragraphs.allSatisfy { paragraph in
            let value = String(paragraph)
            return ordered ? value.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil : (value.hasPrefix("• ") || value.hasPrefix("- "))
        }
        let transformed = paragraphs.enumerated().map { index, paragraph -> String in
            let value = String(paragraph)
            let stripped = value.replacingOccurrences(of: #"^(?:•|-|\d+\.)\s"#, with: "", options: .regularExpression)
            if alreadyFormatted { return stripped }
            return ordered ? "\(index + 1). \(stripped)" : "• \(stripped)"
        }.joined(separator: "\n")
        textView.insertText(transformed, replacementRange: range)
    }

    func addLink() {
        guard let textView, textView.selectedRange().length > 0 else { NSSound.beep(); return }
        let field = NSTextField(string: "https://")
        field.placeholderString = "https://example.com"
        let alert = NSAlert()
        alert.messageText = "Add Link"
        alert.informativeText = "Enter the web address for the selected text."
        alert.accessoryView = field
        alert.addButton(withTitle: "Add Link")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn,
              let url = URL(string: field.stringValue), !field.stringValue.isEmpty else { return }
        textView.textStorage?.addAttributes([.link: url, .foregroundColor: NSColor.linkColor, .underlineStyle: NSUnderlineStyle.single.rawValue], range: textView.selectedRange())
        textView.didChangeText()
    }
}

private struct RichTextViewRepresentable: NSViewRepresentable {
    @Binding var value: NSAttributedString
    let isEditable: Bool
    let controller: RichTextController
    let onChange: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        guard let textView = scrollView.documentView as? NSTextView else { return scrollView }
        textView.delegate = context.coordinator
        textView.isRichText = true
        textView.allowsUndo = true
        textView.importsGraphics = false
        textView.isAutomaticLinkDetectionEnabled = true
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 10, height: 10)
        textView.textStorage?.setAttributedString(value)
        controller.textView = textView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }
        context.coordinator.parent = self
        controller.textView = textView
        textView.isEditable = isEditable
        if !textView.attributedString().isEqual(to: value) {
            let selection = textView.selectedRange()
            textView.textStorage?.setAttributedString(value)
            textView.setSelectedRange(NSRange(location: min(selection.location, value.length), length: 0))
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: RichTextViewRepresentable
        init(parent: RichTextViewRepresentable) { self.parent = parent }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.value = textView.attributedString().copy() as! NSAttributedString
            parent.onChange()
        }

        func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            guard commandSelector == #selector(NSResponder.insertNewline(_:)) else { return false }
            let source = textView.string as NSString
            let paragraph = source.substring(with: source.paragraphRange(for: textView.selectedRange()))
                .trimmingCharacters(in: .newlines)
            let prefix: String?
            if paragraph.hasPrefix("• ") { prefix = "• " }
            else if let match = paragraph.range(of: #"^\d+\.\s"#, options: .regularExpression),
                    let number = Int(paragraph[..<match.upperBound].dropLast(2)) { prefix = "\(number + 1). " }
            else { prefix = nil }
            guard let prefix else { return false }
            if paragraph == prefix.trimmingCharacters(in: .whitespaces) {
                let range = source.paragraphRange(for: textView.selectedRange())
                textView.insertText("", replacementRange: range)
            } else {
                textView.insertText("\n\(prefix)", replacementRange: textView.selectedRange())
            }
            return true
        }
    }
}
