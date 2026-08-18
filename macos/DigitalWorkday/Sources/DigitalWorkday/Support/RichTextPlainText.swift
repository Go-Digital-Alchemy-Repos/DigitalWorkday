import Foundation

enum RichTextPlainText {
    static func displayText(from rawValue: String?) -> String {
        guard let rawValue, !rawValue.isEmpty else { return "" }
        guard
            let data = rawValue.data(using: .utf8),
            let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            root["type"] as? String == "doc"
        else { return rawValue }

        return render(root).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func render(_ node: [String: Any]) -> String {
        let type = node["type"] as? String ?? ""
        if type == "text" { return node["text"] as? String ?? "" }
        if type == "hardBreak" { return "\n" }
        if type == "mention", let attributes = node["attrs"] as? [String: Any] {
            let label = attributes["label"] ?? attributes["id"]
            return label.map { "@\($0)" } ?? ""
        }

        let children = node["content"] as? [[String: Any]] ?? []
        switch type {
        case "doc":
            return children.map(render).filter { !$0.isEmpty }.joined(separator: "\n")
        case "bulletList":
            return children.map { "• " + render($0).replacingOccurrences(of: "\n", with: "\n  ") }.joined(separator: "\n")
        case "orderedList":
            return children.enumerated().map { index, child in
                "\(index + 1). " + render(child).replacingOccurrences(of: "\n", with: "\n   ")
            }.joined(separator: "\n")
        case "listItem":
            return children.map(render).filter { !$0.isEmpty }.joined(separator: "\n")
        case "paragraph", "heading", "blockquote":
            return children.map(render).joined()
        default:
            return children.map(render).joined()
        }
    }
}
