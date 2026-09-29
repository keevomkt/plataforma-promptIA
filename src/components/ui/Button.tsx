import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantStyles: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong disabled:bg-ink-faint/60",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong disabled:text-ink-faint",
  ghost: "text-ink-soft hover:bg-sunken disabled:text-ink-faint",
  danger: "bg-removed text-white hover:bg-removed/90 disabled:bg-removed/40",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-[13px]",
  md: "px-3.5 py-2 text-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) => {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors disabled:cursor-not-allowed",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";
