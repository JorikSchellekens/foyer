"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Sonner ships its own font stack and drop shadow on the toast
          // element, so those two need to be forced back onto the palette.
          toast:
            "group/toast font-sans! shadow-[var(--shadow-overlay)]! ring-1 ring-foreground/10",
          title: "text-sm font-medium",
          description: "text-muted-foreground!",
          actionButton:
            "rounded-md! bg-primary! text-primary-foreground! transition-colors duration-[var(--dur-fast)]",
          cancelButton:
            "rounded-md! bg-muted! text-muted-foreground! transition-colors duration-[var(--dur-fast)] hover:text-foreground!",
          closeButton:
            "border-border! bg-popover! text-muted-foreground! transition-colors duration-[var(--dur-fast)] hover:text-foreground!",
          success: "[&_[data-icon]]:text-primary",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-[var(--chart-4)]",
          info: "[&_[data-icon]]:text-muted-foreground",
          loading: "[&_[data-icon]]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
