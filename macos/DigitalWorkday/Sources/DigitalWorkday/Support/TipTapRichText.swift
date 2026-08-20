import AppKit
import Foundation

@MainActor enum TipTapRichText {
    static func attributedString(from rawValue: String) -> NSAttributedString {
        guard let data = rawValue.data(using: .utf8),
              let document = try? JSONDecoder().decode(Node.self, from: data),
              document.type == "doc" else {
            return NSAttributedString(string: rawValue, attributes: baseAttributes)
        }

        let result = NSMutableAttributedString()
        append(document, to: result, listMarker: nil)
        while result.string.hasSuffix("\n") { result.deleteCharacters(in: NSRange(location: result.length - 1, length: 1)) }
        return result
    }

    static func json(from attributedString: NSAttributedString) -> String {
        let nodes = blockNodes(from: attributedString)
        let document = Node(type: "doc", content: nodes.isEmpty ? [Node(type: "paragraph")] : nodes)
        guard let data = try? JSONEncoder().encode(document) else { return attributedString.string }
        return String(decoding: data, as: UTF8.self)
    }

    private static var baseAttributes: [NSAttributedString.Key: Any] {
        [.font: NSFont.preferredFont(forTextStyle: .body), .foregroundColor: NSColor.labelColor]
    }

    private static func append(_ node: Node, to result: NSMutableAttributedString, listMarker: String?) {
        switch node.type {
        case "doc":
            node.content?.forEach { append($0, to: result, listMarker: nil) }
        case "paragraph":
            if let listMarker { result.append(NSAttributedString(string: listMarker, attributes: baseAttributes)) }
            node.content?.forEach { append($0, to: result, listMarker: nil) }
            result.append(NSAttributedString(string: "\n", attributes: baseAttributes))
        case "heading":
            let start = result.length
            node.content?.forEach { append($0, to: result, listMarker: nil) }
            let size: CGFloat = node.attrs?.level == 1 ? 22 : 18
            result.addAttribute(.font, value: NSFont.systemFont(ofSize: size, weight: .semibold), range: NSRange(location: start, length: result.length - start))
            result.append(NSAttributedString(string: "\n", attributes: baseAttributes))
        case "bulletList":
            node.content?.forEach { append($0, to: result, listMarker: "• ") }
        case "orderedList":
            var index = node.attrs?.start ?? 1
            node.content?.forEach { child in
                append(child, to: result, listMarker: "\(index). ")
                index += 1
            }
        case "listItem":
            node.content?.forEach { append($0, to: result, listMarker: listMarker) }
        case "hardBreak":
            result.append(NSAttributedString(string: "\n", attributes: baseAttributes))
        case "text":
            var attributes = baseAttributes
            for mark in node.marks ?? [] {
                switch mark.type {
                case "bold":
                    let current = attributes[.font] as? NSFont ?? NSFont.preferredFont(forTextStyle: .body)
                    attributes[.font] = NSFontManager.shared.convert(current, toHaveTrait: .boldFontMask)
                case "italic":
                    let current = attributes[.font] as? NSFont ?? NSFont.preferredFont(forTextStyle: .body)
                    attributes[.font] = NSFontManager.shared.convert(current, toHaveTrait: .italicFontMask)
                case "underline": attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
                case "strike": attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
                case "link":
                    if let href = mark.attrs?.href, let url = URL(string: href) {
                        attributes[.link] = url
                        attributes[.foregroundColor] = NSColor.linkColor
                        attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
                    }
                default: break
                }
            }
            result.append(NSAttributedString(string: node.text ?? "", attributes: attributes))
        default:
            node.content?.forEach { append($0, to: result, listMarker: listMarker) }
        }
    }

    private static func blockNodes(from value: NSAttributedString) -> [Node] {
        guard value.length > 0 else { return [Node(type: "paragraph")] }
        let source = value.string as NSString
        var blocks: [Node] = []
        var location = 0
        var orderedItems: [Node] = []
        var bulletItems: [Node] = []

        func flushLists() {
            if !bulletItems.isEmpty { blocks.append(Node(type: "bulletList", content: bulletItems)); bulletItems.removeAll() }
            if !orderedItems.isEmpty { blocks.append(Node(type: "orderedList", attrs: .init(start: 1), content: orderedItems)); orderedItems.removeAll() }
        }

        while location < source.length {
            let lineRange = source.lineRange(for: NSRange(location: location, length: 0))
            var contentRange = lineRange
            while contentRange.length > 0, CharacterSet.newlines.contains(UnicodeScalar(source.character(at: NSMaxRange(contentRange) - 1))!) {
                contentRange.length -= 1
            }
            let line = source.substring(with: contentRange)
            let bulletPrefix = line.hasPrefix("• ") ? 2 : (line.hasPrefix("- ") ? 2 : 0)
            let orderedPrefix = orderedPrefixLength(line)
            if bulletPrefix > 0 {
                if !orderedItems.isEmpty { flushLists() }
                let range = NSRange(location: contentRange.location + bulletPrefix, length: max(0, contentRange.length - bulletPrefix))
                bulletItems.append(Node(type: "listItem", content: [Node(type: "paragraph", content: inlineNodes(from: value, range: range))]))
            } else if orderedPrefix > 0 {
                if !bulletItems.isEmpty { flushLists() }
                let range = NSRange(location: contentRange.location + orderedPrefix, length: max(0, contentRange.length - orderedPrefix))
                orderedItems.append(Node(type: "listItem", content: [Node(type: "paragraph", content: inlineNodes(from: value, range: range))]))
            } else {
                flushLists()
                blocks.append(Node(type: "paragraph", content: inlineNodes(from: value, range: contentRange)))
            }
            location = NSMaxRange(lineRange)
        }
        flushLists()
        return blocks
    }

    private static func orderedPrefixLength(_ line: String) -> Int {
        guard let match = line.range(of: #"^\d+\.\s"#, options: .regularExpression) else { return 0 }
        return line.distance(from: line.startIndex, to: match.upperBound)
    }

    private static func inlineNodes(from value: NSAttributedString, range: NSRange) -> [Node] {
        guard range.length > 0 else { return [] }
        var nodes: [Node] = []
        value.enumerateAttributes(in: range) { attributes, subrange, _ in
            var marks: [Mark] = []
            if let font = attributes[.font] as? NSFont {
                if font.fontDescriptor.symbolicTraits.contains(.bold) { marks.append(Mark(type: "bold")) }
                if font.fontDescriptor.symbolicTraits.contains(.italic) { marks.append(Mark(type: "italic")) }
            }
            if (attributes[.underlineStyle] as? Int ?? 0) != 0 { marks.append(Mark(type: "underline")) }
            if (attributes[.strikethroughStyle] as? Int ?? 0) != 0 { marks.append(Mark(type: "strike")) }
            if let link = attributes[.link] {
                marks.append(Mark(type: "link", attrs: .init(href: String(describing: link))))
            }
            nodes.append(Node(type: "text", text: (value.string as NSString).substring(with: subrange), marks: marks.isEmpty ? nil : marks))
        }
        return nodes
    }

    private struct Node: Codable {
        let type: String
        var attrs: Attributes?
        var content: [Node]?
        var text: String?
        var marks: [Mark]?
    }

    private struct Mark: Codable {
        let type: String
        var attrs: Attributes?
    }

    private struct Attributes: Codable {
        var href: String?
        var textAlign: String?
        var start: Int?
        var level: Int?

        init(href: String? = nil, textAlign: String? = nil, start: Int? = nil, level: Int? = nil) {
            self.href = href
            self.textAlign = textAlign
            self.start = start
            self.level = level
        }
    }
}
