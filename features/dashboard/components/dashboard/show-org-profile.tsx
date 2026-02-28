import { Button } from '@/components/ui/button'
import { OrganizationProfile } from '@clerk/nextjs'
import { ArrowLeft } from 'lucide-react'
import React from 'react'

const ShowOrgProfile = ({handleBackToDashboard,organization}:any) => {
  return (
    <div className="flex-1 ml-20 lg:ml-0 bg-gray-50 min-h-screen flex flex-col">
        {/* Header with back button */}
        <div className="flex-shrink-0 p-4 sm:p-6 bg-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              onClick={handleBackToDashboard}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 self-start"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                Team Management - {organization?.name}
              </h1>
            </div>
          </div>
        </div>

        {/* Organization Profile Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 w-full max-w-none overflow-auto">
            <div className="min-h-full">
              <OrganizationProfile
                appearance={{
                  elements: {
                    rootBox: {
                      width: "100%",
                      height: "100%",
                      minHeight: "100vh",
                    },
                    cardBox: {
                      width: "100%",
                      maxWidth: "none",
                      height: "auto",
                      minHeight: "100%",
                      boxShadow: "none",
                      border: "none",
                      borderRadius: "0",
                      padding: "1rem",
                      "@media (min-width: 640px)": {
                        padding: "1.5rem",
                      },
                      "@media (min-width: 1024px)": {
                        padding: "2rem",
                      },
                    },
                    headerTitle: {
                      fontSize: "1.25rem",
                      "@media (min-width: 640px)": {
                        fontSize: "1.5rem",
                      },
                    },
                    headerSubtitle: {
                      fontSize: "0.875rem",
                      "@media (min-width: 640px)": {
                        fontSize: "1rem",
                      },
                    },
                    navbar: {
                      flexDirection: "column",
                    },
                    navbarButton: {
                      width: "100%",
                      justifyContent: "flex-start",
                      "@media (min-width: 768px)": {
                        width: "auto",
                        justifyContent: "center",
                      },
                    },
                    formFieldInput: {
                      width: "100%",
                    },
                    formButtonPrimary: {
                      width: "100%",
                      "@media (min-width: 640px)": {
                        width: "auto",
                      },
                    },
                    table: {
                      fontSize: "0.875rem",
                      overflowX: "auto",
                    },
                    tableHead: {
                      fontSize: "0.75rem",
                      "@media (min-width: 640px)": {
                        fontSize: "0.875rem",
                      },
                    },
                    tableCell: {
                      padding: "0.5rem",
                      "@media (min-width: 640px)": {
                        padding: "0.75rem",
                      },
                    },
                    memberPreview: {
                      flexDirection: "column",
                      "@media (min-width: 640px)": {
                        flexDirection: "row",
                      },
                    },
                    organizationPreview: {
                      flexDirection: "column",
                      alignItems: "flex-start",
                      "@media (min-width: 640px)": {
                        flexDirection: "row",
                        alignItems: "center",
                      },
                    },
                  },
                  layout: {
                    shimmer: false,
                  },
                  variables: {
                    borderRadius: "0.5rem",
                    spacingUnit: "1rem",
                  },
                }}
                routing="hash"
              />
            </div>
          </div>
        </div>
      </div>
  )
}

export default ShowOrgProfile