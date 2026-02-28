import { cn } from "@/lib/utils";
 interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
  isCollapsed?: boolean;
}
const NavItem = ({
  icon,
  label,
  isActive = false,
  onClick,
  className,
  isCollapsed = false,
}: NavItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center text-left text-sm font-medium rounded-lg transition-colors",
      isCollapsed
        ? "justify-center p-2 sm:p-3 min-h-[44px] sm:min-h-[48px]"
        : "gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-3 min-h-[40px] sm:min-h-[44px]",
      "hover:bg-gray-50 active:bg-gray-100",
      isActive
        ? "bg-blue-50 text-blue-700"
        : "text-gray-700 hover:text-gray-900",
      className
    )}
  >
    <span
      className={cn(
        "flex-shrink-0",
        isActive ? "text-blue-600" : "text-gray-500",
        isCollapsed ? "text-gray-600" : "",
        "w-4 h-4 sm:w-5 sm:h-5"
      )}
    >
      {icon}
    </span>
    {!isCollapsed && (
      <span className="font-sans truncate text-xs sm:text-sm">{label}</span>
    )}
  </button>
);

export default NavItem;
