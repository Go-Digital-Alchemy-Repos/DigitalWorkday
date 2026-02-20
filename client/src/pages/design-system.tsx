import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusChip } from "@/components/ui/status-chip";
import { Separator } from "@/components/ui/separator";
import { Bell, Check, ChevronRight, Download, Heart, Mail, Plus, Search, Settings, Star, Trash2, Upload, X } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground" data-testid={`section-title-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-6 md:p-10 space-y-10 max-w-5xl mx-auto" data-testid="design-system-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-design-system-title">Design System</h1>
        <p className="text-sm text-muted-foreground mt-1">Premium component library and visual tokens</p>
      </div>

      <Separator />

      <Section title="Buttons">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button data-testid="button-default">Default</Button>
            <Button variant="secondary" data-testid="button-secondary">Secondary</Button>
            <Button variant="outline" data-testid="button-outline">Outline</Button>
            <Button variant="ghost" data-testid="button-ghost">Ghost</Button>
            <Button variant="destructive" data-testid="button-destructive">Destructive</Button>
            <Button disabled data-testid="button-disabled">Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" data-testid="button-sm">Small</Button>
            <Button size="default" data-testid="button-md">Default</Button>
            <Button size="lg" data-testid="button-lg">Large</Button>
            <Button size="icon" data-testid="button-icon"><Plus /></Button>
            <Button size="icon" variant="outline" data-testid="button-icon-outline"><Settings /></Button>
            <Button size="icon" variant="ghost" data-testid="button-icon-ghost"><Bell /></Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button data-testid="button-with-icon-left"><Download className="mr-1" /> Download</Button>
            <Button variant="outline" data-testid="button-with-icon-right">Upload <Upload className="ml-1" /></Button>
          </div>
        </div>
      </Section>

      <Separator />

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <Badge data-testid="badge-default">Default</Badge>
          <Badge variant="secondary" data-testid="badge-secondary">Secondary</Badge>
          <Badge variant="outline" data-testid="badge-outline">Outline</Badge>
          <Badge variant="destructive" data-testid="badge-destructive">Destructive</Badge>
        </div>
      </Section>

      <Separator />

      <Section title="Status Chips (CRM)">
        <div className="flex flex-wrap items-center gap-3">
          {["Lead", "Prospect", "Active", "Won", "Lost", "Paused", "Archived", "Pending", "In Progress", "Completed"].map((status) => (
            <StatusChip key={status} status={status} data-testid={`status-chip-${status.toLowerCase()}`} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span className="text-sm text-muted-foreground mr-2">Small:</span>
          {["Active", "Won", "Lost"].map((status) => (
            <StatusChip key={status} status={status} size="sm" />
          ))}
          <span className="text-sm text-muted-foreground mr-2 ml-4">No dot:</span>
          {["Lead", "Prospect"].map((status) => (
            <StatusChip key={status} status={status} showDot={false} />
          ))}
        </div>
      </Section>

      <Separator />

      <Section title="Cards">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card data-testid="card-static">
            <CardHeader>
              <CardTitle>Static Card</CardTitle>
              <CardDescription>Default card with specular highlight</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Notice the subtle highlight along the top edge and the soft shadow. This card uses the premium surface and border tokens.</p>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" data-testid="button-card-action">Action</Button>
              <Button size="sm" variant="ghost" data-testid="button-card-cancel">Cancel</Button>
            </CardFooter>
          </Card>

          <Card className="card-interactive" data-testid="card-interactive">
            <CardHeader>
              <CardTitle>Interactive Card</CardTitle>
              <CardDescription>Hover to see lift effect</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">This card uses the <code className="text-xs bg-muted px-1 py-0.5 rounded">card-interactive</code> class for hover lift and shadow float effects.</p>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Badge variant="secondary">Featured</Badge>
              <Badge variant="outline">Premium</Badge>
            </CardFooter>
          </Card>
        </div>
      </Section>

      <Separator />

      <Section title="Inputs & Textareas">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Text Input</label>
            <Input placeholder="Enter your name..." data-testid="input-text" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Search Input</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search..." data-testid="input-search" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Disabled Input</label>
            <Input disabled placeholder="Disabled..." data-testid="input-disabled" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Select</label>
            <Select data-testid="select-demo">
              <SelectTrigger data-testid="select-trigger-demo">
                <SelectValue placeholder="Choose an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option1">Option 1</SelectItem>
                <SelectItem value="option2">Option 2</SelectItem>
                <SelectItem value="option3">Option 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2 max-w-2xl mt-4">
          <label className="text-sm font-medium text-foreground">Textarea</label>
          <Textarea placeholder="Write something..." data-testid="textarea-demo" />
        </div>
      </Section>

      <Separator />

      <Section title="Tabs">
        <Tabs defaultValue="overview" className="max-w-xl" data-testid="tabs-demo">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
                <CardDescription>Active tab content with premium shadow transition</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>Analytics</CardTitle>
                <CardDescription>Analytics tab content</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Reports</CardTitle>
                <CardDescription>Reports tab content</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      <Separator />

      <Section title="Dialog">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="button-open-dialog">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-content">
            <DialogHeader>
              <DialogTitle>Premium Dialog</DialogTitle>
              <DialogDescription>
                Notice the frosted glass overlay, elevated shadow, and refined border styling.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input placeholder="Enter project name..." data-testid="input-dialog" />
              <Select>
                <SelectTrigger data-testid="select-dialog-trigger">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-dialog-cancel">Cancel</Button>
              <Button onClick={() => setDialogOpen(false)} data-testid="button-dialog-save">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Separator />

      <Section title="Tooltips">
        <div className="flex flex-wrap items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-tooltip-star"><Star /></Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add to favorites</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-tooltip-mail"><Mail /></Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Send message</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-tooltip-trash"><Trash2 /></Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete item</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Separator />

      <Section title="Avatars">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar data-testid="avatar-image">
            <AvatarImage src="https://api.dicebear.com/7.x/initials/svg?seed=JD" alt="User" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <Avatar data-testid="avatar-fallback">
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
          <Avatar className="h-8 w-8" data-testid="avatar-small">
            <AvatarFallback className="text-xs">SM</AvatarFallback>
          </Avatar>
          <Avatar className="h-12 w-12" data-testid="avatar-large">
            <AvatarFallback>LG</AvatarFallback>
          </Avatar>
        </div>
      </Section>

      <Separator />

      <Section title="Surface & Depth Tokens">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-0 border border-subtle rounded-lg p-4 space-y-1" data-testid="surface-0">
            <span className="text-xs font-medium text-muted-foreground">Surface 0</span>
            <p className="text-sm text-foreground">Base / background layer</p>
          </div>
          <div className="bg-surface-1 border border-subtle rounded-lg p-4 space-y-1" data-testid="surface-1">
            <span className="text-xs font-medium text-muted-foreground">Surface 1</span>
            <p className="text-sm text-foreground">Card / content layer</p>
          </div>
          <div className="bg-surface-2 border border-subtle rounded-lg p-4 space-y-1" data-testid="surface-2">
            <span className="text-xs font-medium text-muted-foreground">Surface 2</span>
            <p className="text-sm text-foreground">Elevated / popover layer</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-card rounded-lg p-4 shadow-soft space-y-1" data-testid="shadow-soft">
            <span className="text-xs font-medium text-muted-foreground">Shadow Soft</span>
            <p className="text-sm text-foreground">Resting / default depth</p>
          </div>
          <div className="bg-card rounded-lg p-4 shadow-medium space-y-1" data-testid="shadow-medium">
            <span className="text-xs font-medium text-muted-foreground">Shadow Medium</span>
            <p className="text-sm text-foreground">Slightly raised depth</p>
          </div>
          <div className="bg-card rounded-lg p-4 shadow-float space-y-1" data-testid="shadow-float">
            <span className="text-xs font-medium text-muted-foreground">Shadow Float</span>
            <p className="text-sm text-foreground">Floating / modal depth</p>
          </div>
        </div>
      </Section>

      <div className="pb-10" />
    </div>
  );
}
