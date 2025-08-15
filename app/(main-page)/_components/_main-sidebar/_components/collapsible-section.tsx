"use client"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

export interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

const CollapsibleSection = ({ title, children, defaultOpen = true }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="space-y-1 sm:space-y-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 sm:px-3 py-1 sm:py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span className="text-xs">{title}</span>
        <ChevronDown className={cn("h-3 w-3 sm:h-4 sm:w-4 transition-transform", isOpen ? "rotate-0" : "-rotate-90")} />
      </button>
      {isOpen && <div className="space-y-1">{children}</div>}
    </div>
  )
}

export default CollapsibleSection