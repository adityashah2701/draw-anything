import { Loader2 } from 'lucide-react'
import React from 'react'

const MemberLoader = () => {
  return (
    <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
            <span className="ml-2 text-gray-600">Loading members...</span>
          </div>
        </div>
      </div>
  )
}

export default MemberLoader