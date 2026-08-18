import * as React from 'react';

import { cn } from '../../lib/utils';

interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ value, onValueChange, min = 0, max = 100, step = 1, disabled, className }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={(e) => onValueChange([parseFloat(e.target.value)])}
        disabled={disabled}
        className={cn(
          'w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer',
          'accent-primary',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      />
    );
  },
);
Slider.displayName = 'Slider';

export { Slider };
