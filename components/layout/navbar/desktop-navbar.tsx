import { Button } from '@/components/ui/button'
import { OrganizationSwitcher, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import React from 'react'
interface Props {
    isSignedIn : boolean
}
const DesktopNavbar = ({isSignedIn}:Props) => {
  return (
   <div className="hidden md:flex items-center">
              {!isSignedIn && (
                <div className="flex items-center gap-3">
                  <SignInButton mode="modal">
                    <Button variant="ghost" className="font-medium">
                      Sign In
                    </Button>
                  </SignInButton>
                  <div className="w-px h-6 bg-border"></div>
                  <SignUpButton mode="modal">
                    <Button className="font-medium shadow-sm">
                      Get Started
                    </Button>
                  </SignUpButton>
                </div>
              )}

              {isSignedIn && (
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    className="font-medium shadow-sm bg-transparent"
                  >
                    <OrganizationSwitcher createOrganizationMode="modal" />
                  </Button>
                  <div className="w-px h-6 bg-border"></div>
                  <div className="relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full opacity-20"></div>
                    <div className="relative">
                      <UserButton />
                    </div>
                  </div>
                </div>
              )}
            </div>
  )
}

export default DesktopNavbar