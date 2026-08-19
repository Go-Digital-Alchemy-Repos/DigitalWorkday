interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

export function extractMentionsFromTipTapJson(content: string | null | undefined): string[] {
  if (!content) return [];

  try {
    const doc = JSON.parse(content) as TipTapNode;
    return extractMentionsFromNode(doc);
  } catch {
    return [];
  }
}

function extractMentionsFromNode(node: TipTapNode): string[] {
  const mentions: string[] = [];

  if (node.type === "mention" && node.attrs?.id) {
    mentions.push(String(node.attrs.id));
  }

  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      mentions.push(...extractMentionsFromNode(child));
    }
  }

  return Array.from(new Set(mentions));
}

export function getMentionDelta(
  oldContent: string | null | undefined,
  newContent: string | null | undefined
): { added: string[]; removed: string[] } {
  const oldMentions = new Set(extractMentionsFromTipTapJson(oldContent));
  const newMentions = new Set(extractMentionsFromTipTapJson(newContent));

  const added = Array.from(newMentions).filter((id) => !oldMentions.has(id));
  const removed = Array.from(oldMentions).filter((id) => !newMentions.has(id));

  return { added, removed };
}

export function getPlainTextFromTipTapJson(content: unknown): string {
  if (content === null || content === undefined || content === "") return "";

  if (typeof content === "object") {
    return extractTextFromNode(content as TipTapNode).trim();
  }

  if (typeof content !== "string") return String(content);

  try {
    const doc = JSON.parse(content) as TipTapNode;
    return extractTextFromNode(doc).trim();
  } catch {
    return content;
  }
}

function extractTextFromNode(node: TipTapNode | null | undefined): string {
  if (!node || typeof node !== "object") return "";

  if (node.type === "text" && node.text) {
    return node.text;
  }

  if (node.type === "mention" && node.attrs?.label) {
    return `@${node.attrs.label}`;
  }

  if (node.content && Array.isArray(node.content)) {
    const separator = node.type === "doc" || node.type === "bulletList" || node.type === "orderedList"
      ? "\n"
      : "";
    return node.content
      .map((child) => extractTextFromNode(child))
      .join(separator);
  }

  return "";
}
