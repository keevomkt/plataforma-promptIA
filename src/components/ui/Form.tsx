import { InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";
import clsx from "clsx";

export function Field({
  label,
  hint,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block" {...props}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const fieldBase =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-sunken";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldBase, "resize-y", className)} {...props} />;
}
