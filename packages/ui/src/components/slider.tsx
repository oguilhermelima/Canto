import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "../lib/utils";

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    showTooltip?: boolean;
    formatValue?: (value: number) => string;
  }
>(({ className, showTooltip = false, formatValue, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center py-1",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    {(props.value ?? props.defaultValue ?? [0]).map((val, index) => (
      <SliderPrimitive.Thumb
        key={index}
        className="group relative block h-5 w-5 rounded-full border-2 border-primary bg-primary shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {showTooltip && val !== (props.min ?? 0) && val !== (props.max ?? 100) && (
          <span className="absolute top-6 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background shadow-lg">
            {formatValue ? formatValue(val) : val}
          </span>
        )}
      </SliderPrimitive.Thumb>
    ))}
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
