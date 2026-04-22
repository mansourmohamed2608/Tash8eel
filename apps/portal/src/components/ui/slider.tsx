"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
  className?: string;
  disabled?: boolean;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      value,
      defaultValue = [0],
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      disabled,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const currentValue = value ?? internalValue;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const dragging = React.useRef(false);

    const percentage = ((currentValue[0] - min) / (max - min)) * 100;

    const handleChange = React.useCallback(
      (clientX: number) => {
        if (disabled || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const isRtl =
          getComputedStyle(containerRef.current).direction === "rtl";
        let ratio = isRtl
          ? (rect.right - clientX) / rect.width
          : (clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        const raw = min + ratio * (max - min);
        const stepped = Math.round(raw / step) * step;
        const clamped = Math.max(min, Math.min(max, stepped));
        const newValue = [clamped];
        setInternalValue(newValue);
        onValueChange?.(newValue);
      },
      [disabled, min, max, step, onValueChange],
    );

    React.useEffect(() => {
      const onMove = (e: PointerEvent) => {
        if (dragging.current) handleChange(e.clientX);
      };
      const onUp = () => {
        dragging.current = false;
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    }, [handleChange]);

    const handlePointerDown = (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragging.current = true;
      handleChange(e.clientX);
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center py-2",
          disabled && "opacity-50 cursor-not-allowed",
          className,
        )}
        {...props}
      >
        {/* Clickable/draggable area */}
        <div
          ref={containerRef}
          className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary cursor-pointer"
          onPointerDown={handlePointerDown}
        >
          {/* Filled track */}
          <div
            className="absolute h-full bg-primary rounded-full transition-[width] duration-75"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {/* Thumb */}
        <div
          className="absolute h-5 w-5 rounded-full border-2 border-primary bg-background shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing hover:scale-110"
          style={{
            insetInlineStart: `calc(${percentage}% - 10px)`,
          }}
          onPointerDown={handlePointerDown}
        />
      </div>
    );
  },
);

Slider.displayName = "Slider";

export { Slider };
