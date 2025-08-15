import React from 'react'
import NavItem from './nav-item'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const MobileSidebar = ({primaryNavItems , selectedPage , setSelectedPage , organizationItems , user}:any) => {
  return (
   <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-1 sm:p-2 space-y-3 sm:space-y-4">
            {/* Primary Navigation */}
            <div className="space-y-1">
              {primaryNavItems.map((item:any) => (
                <NavItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  isActive={selectedPage === item.label}
                  onClick={() => setSelectedPage(item.label)}
                  isCollapsed={true}
                />
              ))}
            </div>

            {/* Quick Action */}
            <div className="border-t border-gray-100 pt-2">
              <Button className="w-full h-10 sm:h-12 p-0 rounded-lg" size="sm">
                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>

            {/* Organization items */}
            <div className="border-t border-gray-100 pt-2 space-y-1">
              {organizationItems.map((item:any) => (
                <NavItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  isActive={selectedPage === item.label}
                  onClick={() => setSelectedPage(item.label)}
                  isCollapsed={true}
                />
              ))}
            </div>
          </div>

          {/* Mobile User Profile */}
          <div className="border-t border-gray-100 p-1 sm:p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center justify-center p-2 sm:p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <Avatar className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0">
                    <AvatarImage src={user?.imageUrl || "/placeholder.svg"} alt={user?.fullName} />
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-medium text-xs sm:text-sm">
                      {user?.fullName
                        ?.split(" ")
                        .map((n: string) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 sm:w-56">
                <DropdownMenuItem className="text-sm">View Profile</DropdownMenuItem>
                <DropdownMenuItem className="text-sm">Switch Organization</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 text-sm">Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
  )
}

export default MobileSidebar