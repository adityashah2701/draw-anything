import React from 'react'

const OrganizationLoading = () => {
  return (
     <div className="flex-1 ml-20 lg:ml-0 bg-background min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading organization...</p>
        </div>
      </div>
    </div>
  )
}

export default OrganizationLoading