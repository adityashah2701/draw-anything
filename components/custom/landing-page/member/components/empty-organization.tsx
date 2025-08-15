import { Button } from '@/components/ui/button'
import { Building2, UserPlus, Users } from 'lucide-react'
import React from 'react'

const EmptyOrganization = ({organization,setShowInviteModal}:any) => {
  return (
  <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Team Members</h1>
              <p className="text-gray-600">Manage your organization's team members</p>
            </div>
            <Button 
              onClick={() => setShowInviteModal(true)}
              className="mt-4 lg:mt-0 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Members
            </Button>
          </div>

          {/* Organization Info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
                <Building2 className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{organization.name}</h3>
                <p className="text-gray-500">Organization • {organization.membersCount || 0} members</p>
              </div>
            </div>
          </div>

          {/* Empty Members State */}
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">No Team Members Yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Start building your team by inviting members to join your organization.
            </p>
            <Button 
              onClick={() => setShowInviteModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Your First Member
            </Button>
          </div>
        </div>
      </div>
  )
}

export default EmptyOrganization