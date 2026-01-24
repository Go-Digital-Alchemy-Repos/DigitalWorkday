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

export function getPlainTextFromTipTapJson(content: string | null | undefined): string {
  if (!content) return "";

  try {
    const doc = JSON.parse(content) as TipTapNode;
    return extractTextFromNode(doc);
  } catch {
    return content;
  }
}

function extractTextFromNode(node: TipTapNode): string {
  if (node.type === "text" && node.text) {
    return node.text;
  }

  if (node.type === "mention" && node.attrs?.label) {
    return `@${node.attrs.label}`;
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content
      .map((child) => extractTextFromNode(child))
      .join(node.type === "paragraph" ? "\n" : "");
  }

  return "";
}
