import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

const variants = {
  default: "bg-accent text-bg-primary hover:bg-accent-hover",
  secondary: "bg-bg-tertiary text-text-primary border border-border-light hover:bg-bg-tertiary/80",
  destructive: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
  ghost: "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary",
};

const sizes = {
  default: "h-9 px-3 py-2 text-sm",
  sm: "h-7 px-2 text-xs",
  lg: "h-10 px-4 text-sm",
  icon: "h-8 w-8",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          "disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, type ButtonProps };
