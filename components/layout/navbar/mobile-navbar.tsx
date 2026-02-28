import { Button } from '@/components/ui/button'
import { OrganizationSwitcher, SignInButton, SignUpButton } from '@clerk/nextjs'
import React from 'react'

const MobileNavbar = ({isSignedIn , setIsMobileMenuOpen}:any) => {
  return (
     <div
          className="md:hidden transition-all fixed inset-0 z-50 bg-black/50"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="absolute top-16 sm:top-20 right-0 w-64 bg-white border-l border-gray-200 h-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 space-y-4">
              {!isSignedIn && (
                <>
                  <SignInButton mode="modal">
                    <Button
                      variant="ghost"
                      className="w-full justify-start font-medium"
                    >
                      Sign In
                    </Button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <Button className="w-full font-medium shadow-sm">
                      Get Started
                    </Button>
                  </SignUpButton>
                </>
              )}

              {isSignedIn && (
                <OrganizationSwitcher
                  organizationProfileMode="modal"
                  createOrganizationMode="modal"
                />
              )}
            </div>
          </div>
        </div>
  )
}

export default MobileNavbar