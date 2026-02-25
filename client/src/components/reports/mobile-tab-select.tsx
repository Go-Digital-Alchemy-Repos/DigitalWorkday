import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TabOption {
  value: string;
  label: string;
}

interface MobileTabSelectProps {
  tabs: TabOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function MobileTabSelect({ tabs, value, onValueChange, className }: MobileTabSelectProps) {
  return (
    <div className={cn("md:hidden", className)}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full" data-testid="mobile-tab-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tabs.map((tab) => (
            <SelectItem
              key={tab.value}
              value={tab.value}
              data-testid={`mobile-tab-option-${tab.value}`}
            >
              {tab.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
