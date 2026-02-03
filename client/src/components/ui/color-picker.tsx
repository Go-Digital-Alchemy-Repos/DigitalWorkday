import { useState, useCallback, useEffect } from "react";
import { RgbaColorPicker, RgbaColor } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

function hexToRgba(hex: string): RgbaColor {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
      a: result[4] ? parseInt(result[4], 16) / 255 : 1,
    };
  }
  return { r: 131, g: 186, b: 59, a: 1 };
}

function rgbaToHex(rgba: RgbaColor): string {
  const r = rgba.r.toString(16).padStart(2, "0");
  const g = rgba.g.toString(16).padStart(2, "0");
  const b = rgba.b.toString(16).padStart(2, "0");
  if (rgba.a < 1) {
    const a = Math.round(rgba.a * 255).toString(16).padStart(2, "0");
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

function rgbaToString(rgba: RgbaColor): string {
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a.toFixed(2)})`;
}

interface ColorPickerProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
  "data-testid"?: string;
}

export function ColorPicker({
  value,
  defaultValue = "#83ba3b",
  onChange,
  label,
  "data-testid": testId,
}: ColorPickerProps) {
  const [color, setColor] = useState<RgbaColor>(() =>
    hexToRgba(value || defaultValue)
  );
  const [hexInput, setHexInput] = useState(() =>
    (value || defaultValue).toUpperCase()
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (value) {
      const newColor = hexToRgba(value);
      setColor(newColor);
      setHexInput(value.toUpperCase());
    }
  }, [value]);

  const handleColorChange = useCallback(
    (newColor: RgbaColor) => {
      setColor(newColor);
      const hexValue = rgbaToHex(newColor);
      setHexInput(hexValue.toUpperCase());
      onChange?.(hexValue);
    },
    [onChange]
  );

  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      setHexInput(input.toUpperCase());
      if (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(input)) {
        const newColor = hexToRgba(input);
        setColor(newColor);
        onChange?.(input);
      }
    },
    [onChange]
  );

  const handleOpacityChange = useCallback(
    (values: number[]) => {
      const newColor = { ...color, a: values[0] / 100 };
      setColor(newColor);
      const hexValue = rgbaToHex(newColor);
      setHexInput(hexValue.toUpperCase());
      onChange?.(hexValue);
    },
    [color, onChange]
  );

  const displayColor = rgbaToString(color);

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 font-normal"
            data-testid={testId}
          >
            <div
              className="h-5 w-5 rounded border flex-shrink-0"
              style={{ backgroundColor: displayColor }}
            />
            <span className="text-muted-foreground">{hexInput}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {Math.round(color.a * 100)}%
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-4">
            <RgbaColorPicker color={color} onChange={handleColorChange} />
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-10">Hex</Label>
                <Input
                  value={hexInput}
                  onChange={handleHexInputChange}
                  className="h-8 text-xs font-mono"
                  placeholder="#83BA3B"
                  data-testid={testId ? `${testId}-hex-input` : undefined}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Label className="text-xs w-10">Alpha</Label>
                <Slider
                  value={[Math.round(color.a * 100)]}
                  onValueChange={handleOpacityChange}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                  data-testid={testId ? `${testId}-opacity-slider` : undefined}
                />
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {Math.round(color.a * 100)}%
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 pt-2 border-t">
              <div
                className="h-8 flex-1 rounded border"
                style={{ backgroundColor: displayColor }}
              />
              <span className="text-xs text-muted-foreground font-mono">
                {rgbaToString(color)}
              </span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
