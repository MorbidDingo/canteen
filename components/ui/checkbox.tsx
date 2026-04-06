import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    onCheckedChange?: (checked: boolean | string) => void
  }
>(({ className, onCheckedChange, ...props }, ref) => (
  <div className="relative inline-flex items-center">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 border border-primary rounded ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
        className
      )}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  </div>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
