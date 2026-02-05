import { useState } from "react";
import { format, addDays, startOfWeek, addWeeks, isToday, isTomorrow } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerWithChipsProps {
  value: Date | null | undefined;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  showQuickChips?: boolean;
  error?: boolean;
  className?: string;
  "data-testid"?: string;
}

const quickDateOptions = [
  { label: "Today", getValue: () => new Date() },
  { label: "Tomorrow", getValue: () => addDays(new Date(), 1) },
  { label: "Next Week", getValue: () => startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }) },
];

export function DatePickerWithChips({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  showQuickChips = true,
  error = false,
  className,
  "data-testid": testId,
}: DatePickerWithChipsProps) {
  const [open, setOpen] = useState(false);

  const handleQuickSelect = (getValue: () => Date) => {
    onChange(getValue());
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const getDisplayText = () => {
    if (!value) return placeholder;
    if (isToday(value)) return "Today";
    if (isTomorrow(value)) return "Tomorrow";
    return format(value, "MMM d, yyyy");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          data-testid={testId}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate">{getDisplayText()}</span>
          {value && (
            <X
              className="ml-2 h-4 w-4 flex-shrink-0 opacity-50 hover:opacity-100"
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {showQuickChips && (
          <div className="flex flex-wrap gap-1.5 p-3 border-b">
            {quickDateOptions.map((option) => (
              <Button
                key={option.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleQuickSelect(option.getValue)}
                data-testid={`quick-date-${option.label.toLowerCase().replace(" ", "-")}`}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
        <Calendar
          mode="single"
          selected={value || undefined}
          onSelect={(date) => {
            onChange(date || null);
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              data-testid="clear-date"
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
