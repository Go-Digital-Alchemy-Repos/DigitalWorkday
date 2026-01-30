import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { 
  Loader2, FileText, Search, ArrowLeft, Calendar, HardDrive, RefreshCw, ExternalLink,
  ChevronDown, ChevronRight, Folder, FolderOpen,
  Rocket, Layout, Star, Code, Monitor, Server, Shield, Database, CheckCircle,
  Cloud, Wrench, Activity, Plug, AlertTriangle, Book, Clock, Settings, Key,
  MessageCircle, Terminal, Zap, UserPlus, BookOpen
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient } from "@/lib/queryClient";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DocFile {
  id: string;
  filename: string;
  title: string;
  category: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}

interface DocCategory {
  id: string;
  displayName: string;
  icon: string;
  order: number;
  docs: DocFile[];
}

interface DocsResponse {
  categories: DocCategory[];
}

interface DocContent {
  id: string;
  filename: string;
  title: string;
  content: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "rocket": Rocket,
  "layout": Layout,
  "star": Star,
  "code": Code,
  "monitor": Monitor,
  "server": Server,
  "shield": Shield,
  "database": Database,
  "check-circle": CheckCircle,
  "cloud": Cloud,
  "wrench": Wrench,
  "activity": Activity,
  "plug": Plug,
  "alert-triangle": AlertTriangle,
  "book": Book,
  "clock": Clock,
  "settings": Settings,
  "key": Key,
  "message-circle": MessageCircle,
  "terminal": Terminal,
  "zap": Zap,
  "user-plus": UserPlus,
  "hard-drive": HardDrive,
  "file-text": FileText,
  "folder": Folder,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      } else {
        elements.push(
          <pre key={`code-${i}`} className="bg-muted rounded-md p-4 overflow-x-auto my-4 text-sm font-mono">
            <code>{codeBlockContent.join("\n")}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-3xl font-bold mt-6 mb-4">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-2xl font-semibold mt-6 mb-3 border-b pb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-xl font-semibold mt-4 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith("#### ")) {
      elements.push(<h4 key={i} className="text-lg font-medium mt-3 mb-1">{line.slice(5)}</h4>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-6 list-disc">
          <InlineContent text={line.slice(2)} />
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <li key={i} className="ml-6 list-decimal">
            <InlineContent text={match[2]} />
          </li>
        );
      }
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground my-2">
          <InlineContent text={line.slice(2)} />
        </blockquote>
      );
    } else if (line.startsWith("---") || line.startsWith("***")) {
      elements.push(<hr key={i} className="my-6 border-border" />);
    } else if (line.startsWith("|")) {
      const cells = line.split("|").filter(c => c.trim());
      if (cells.every(c => c.trim().match(/^[-:]+$/))) {
        continue;
      }
      elements.push(
        <div key={i} className="flex border-b border-border">
          {cells.map((cell, idx) => (
            <div key={idx} className="flex-1 px-3 py-2 text-sm">
              <InlineContent text={cell.trim()} />
            </div>
          ))}
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="my-2 leading-relaxed">
          <InlineContent text={line} />
        </p>
      );
    }
  }

  return <div className="prose prose-sm dark:prose-invert max-w-none">{elements}</div>;
}

function InlineContent({ text }: { text: string }) {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [
      codeMatch ? { type: "code", match: codeMatch, index: codeMatch.index! } : null,
      boldMatch ? { type: "bold", match: boldMatch, index: boldMatch.index! } : null,
      linkMatch ? { type: "link", match: linkMatch, index: linkMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    if (first.type === "code") {
      parts.push(
        <code key={`inline-${keyIndex++}`} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
          {first.match![1]}
        </code>
      );
      remaining = remaining.slice(first.index + first.match![0].length);
    } else if (first.type === "bold") {
      parts.push(<strong key={`inline-${keyIndex++}`}>{first.match![1]}</strong>);
      remaining = remaining.slice(first.index + first.match![0].length);
    } else if (first.type === "link") {
      parts.push(
        <a
          key={`inline-${keyIndex++}`}
          href={first.match![2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline inline-flex items-center gap-1"
        >
          {first.match![1]}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
      remaining = remaining.slice(first.index + first.match![0].length);
    }
  }

  return <>{parts}</>;
}

function CategoryIcon({ iconName, className }: { iconName: string; className?: string }) {
  const IconComponent = iconMap[iconName] || FileText;
  return <IconComponent className={className} />;
}

export default function SuperAdminDocs() {
  const { user, isLoading: authLoading } = useAuth();
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["_root", "03-FEATURES", "07-SECURITY"]));

  const { data: docsData, isLoading: docsLoading, refetch } = useQuery<DocsResponse>({
    queryKey: ["/api/v1/super/docs"],
    enabled: !!user && user.role === "super_user",
  });

  const { data: docContent, isLoading: contentLoading } = useQuery<DocContent>({
    queryKey: ["/api/v1/super/docs", selectedDoc],
    enabled: !!selectedDoc,
  });

  // Filter categories and docs based on search
  const filteredCategories = useMemo(() => {
    if (!docsData?.categories) return [];
    if (!searchQuery.trim()) return docsData.categories;

    const query = searchQuery.toLowerCase();
    return docsData.categories
      .map(category => ({
        ...category,
        docs: category.docs.filter(doc =>
          doc.title.toLowerCase().includes(query) ||
          doc.filename.toLowerCase().includes(query)
        ),
      }))
      .filter(category => category.docs.length > 0);
  }, [docsData, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    if (!docsData?.categories) return { totalDocs: 0, totalCategories: 0 };
    const totalDocs = docsData.categories.reduce((sum, cat) => sum + cat.docs.length, 0);
    return { totalDocs, totalCategories: docsData.categories.length };
  }, [docsData]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "super_user") {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex h-full">
      {/* Sidebar with categories */}
      <div className="w-80 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Documentation</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Badge variant="secondary">{stats.totalDocs} docs</Badge>
            <Badge variant="outline">{stats.totalCategories} categories</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search docs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-docs"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {docsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchQuery ? "No matching documents" : "No documentation files found"}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredCategories.map((category) => (
                  <Collapsible
                    key={category.id}
                    open={expandedCategories.has(category.id) || !!searchQuery}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center gap-2 p-2 rounded-md hover-elevate text-left"
                        data-testid={`button-category-${category.id}`}
                      >
                        {expandedCategories.has(category.id) || searchQuery ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <CategoryIcon iconName={category.icon} className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 text-sm font-medium truncate">{category.displayName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {category.docs.length}
                        </Badge>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-6 pl-2 border-l space-y-0.5">
                        {category.docs.map((doc) => (
                          <button
                            key={doc.id}
                            onClick={() => setSelectedDoc(doc.id)}
                            className={`w-full text-left p-2 rounded-md transition-colors text-sm ${
                              selectedDoc === doc.id
                                ? "bg-primary/10 border border-primary/20 text-primary"
                                : "hover-elevate text-muted-foreground hover:text-foreground"
                            }`}
                            data-testid={`button-doc-${doc.id}`}
                          >
                            <div className="flex items-start gap-2">
                              <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                              <span className="truncate">{doc.title}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/v1/super/docs"] });
              refetch();
            }}
            data-testid="button-refresh-docs"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh List
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {!selectedDoc ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center max-w-md">
              <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-xl font-semibold mb-2">App Documentation</h3>
              <p className="text-sm mb-4">
                Browse the documentation library organized by category. Select a document from the sidebar to view its contents.
              </p>
              <div className="grid grid-cols-2 gap-3 text-left">
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Rocket className="h-4 w-4 text-primary" />
                    <span className="font-medium">Getting Started</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Setup and configuration</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Star className="h-4 w-4 text-primary" />
                    <span className="font-medium">Features</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Core functionality docs</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="font-medium">Security</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Auth & access control</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Cloud className="h-4 w-4 text-primary" />
                    <span className="font-medium">Deployment</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Production guides</p>
                </Card>
              </div>
            </div>
          </div>
        ) : contentLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : docContent ? (
          <>
            <div className="border-b px-6 py-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedDoc(null)}
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h1 className="text-xl font-semibold">{docContent.title}</h1>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3.5 w-3.5" />
                        {formatBytes(docContent.sizeBytes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(docContent.modifiedAt)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {docContent.relativePath}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6 max-w-4xl">
                <MarkdownRenderer content={docContent.content} />
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Failed to load document</p>
          </div>
        )}
      </div>
    </div>
  );
}
