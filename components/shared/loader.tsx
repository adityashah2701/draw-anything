import { Loader2 } from 'lucide-react'
import React from 'react'

const CustomLoader = () => {
  return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Loader2 className="animate-spin size-8 text-gray-600" />
            <div className="absolute inset-0 bg-gray-300 rounded-full blur-sm opacity-20 animate-pulse"></div>
          </div>
          <p className="text-lg text-gray-600 font-medium">
            Loading your workspace...
          </p>
        </div>
      </div>
  )
}

export default CustomLoader