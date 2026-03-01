"use client";
import { Button } from "@/components/ui/button";
import { UserButton, useUser } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import MobileNavbar from "./mobile-navbar";
import DesktopNavbar from "./desktop-navbar";

interface CleanNavbarProps {
  isSidebarIntegrated?: boolean;
}

const CleanNavbar = ({ isSidebarIntegrated }: CleanNavbarProps) => {
  const { isLoaded, isSignedIn } = useUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (!isLoaded) {
    return null;
  }

  return (
    <>
      <nav
        className={
          isSidebarIntegrated
            ? "w-full h-full flex items-center"
            : "w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-full"
        }
      >
        <div
          className={
            isSidebarIntegrated
              ? "flex items-center w-full justify-between"
              : "px-4 sm:px-6 lg:px-8 py-3 sm:py-4 h-full flex items-center w-full justify-between"
          }
        >
          <div className="flex flex-1 items-center justify-between">
            {/* Logo Section - Responsive */}
            {!isSidebarIntegrated && (
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg opacity-20"></div>
                  <div className="relative bg-background p-1.5 sm:p-2 rounded-lg border">
                    <Image
                      src={"/logo.svg"}
                      alt="Logo"
                      height={20}
                      width={20}
                      className="sm:h-6 sm:w-6"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight">
                    Draw Anything
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground font-medium hidden sm:block">
                    Collaborative Whiteboard
                  </p>
                </div>
              </div>
            )}

            {/* Desktop Navigation */}
            {!isSidebarIntegrated && <DesktopNavbar isSignedIn={isSignedIn} />}

            {/* Mobile Menu Button - ONLY IF NOT SIDEBAR INTEGRATED */}
            {!isSidebarIntegrated && (
              <div className="md:hidden flex items-center gap-2">
                {isSignedIn && (
                  <div className="relative">
                    <UserButton />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2"
                >
                  {isMobileMenuOpen ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </Button>
              </div>
            )}
            {/* User Profile for Integrated Mobile/Desktop Navbar Replacement */}
            {isSidebarIntegrated && (
              <div className="flex items-center gap-2 justify-end w-full">
                {isSignedIn && (
                  <div className="relative">
                    <UserButton />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && !isSidebarIntegrated && (
        <MobileNavbar
          isSignedIn={isSignedIn}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
      )}
    </>
  );
};

export default CleanNavbar;
