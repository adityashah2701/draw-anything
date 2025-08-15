// Updated Member Component with proper Clerk data fetching
"use client"
import React, { useState, useEffect } from "react";
import { useOrganization } from "@clerk/nextjs";
import {
  Search,
  UserPlus,
  Eye,
  Mail,
  Clock,
  Settings,
  MoreVertical,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EmptyOrganization from "./components/empty-organization";
import NoOrganization from "./components/no-organization";
import { useMember } from "./components/utility.function";
import MemberLoader from "./components/member-loader";
import InviteButton from "../../custom-invite-dialog";

interface MemberProps {
  user: any;
  organization?: any;
}

const Member = ({ user, organization }: MemberProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { getRoleColor, formatRole, getRoleIcon } = useMember();
  // Get organization methods from useOrganization hook
  const {
    organization: org,
    membership: userMembership,
    memberships,
    invitations: orgInvitations,
    isLoaded: orgLoaded,
  } = useOrganization({
    memberships: {
      infinite: true,
    },
    invitations: {
      infinite: true,
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!org || !orgLoaded) return;

      setLoading(true);
      try {
        // Fetch all members
        if (memberships?.data) {
          setMembers(memberships.data);
        }
      } catch (error) {
        console.error("Error fetching organization data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [org, orgLoaded, memberships, orgInvitations]);

  if (!organization) {
    return <NoOrganization user={user} />;
  }

  if (organization && members.length === 0 && !loading) {
    return (
      <EmptyOrganization
        organization={organization}
        setShowInviteModal={setShowInviteModal}
      />
    );
  }

  const filteredMembers = members.filter((membership: any) => {
    const member = membership.publicUserData;
    if (!member) return false;

    const searchLower = searchQuery.toLowerCase();
    return (
      member.firstName?.toLowerCase().includes(searchLower) ||
      member.lastName?.toLowerCase().includes(searchLower) ||
      member.identifier?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <MemberLoader />;
  }

  return (
    <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Team Members
            </h1>
          </div>
         <InviteButton isOpen={showInviteModal} setIsOpen={setShowInviteModal} />
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search members..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Roles
            </Button>
          </div>
        </div>

        {/* Members List */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Active Members ({filteredMembers.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredMembers.map((membership: any) => {
              const member = membership.publicUserData;
              return (
                <div
                  key={membership.id}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage
                          src={member.imageUrl}
                          alt={member.firstName}
                        />
                        <AvatarFallback className="bg-blue-100 text-blue-700 font-medium">
                          {member.firstName?.[0]}
                          {member.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="font-medium text-gray-900">
                            {member.firstName} {member.lastName}
                            {member.userId === user?.id && (
                              <span className="ml-2 text-sm text-gray-500">
                                You
                              </span>
                            )}
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getRoleColor(membership.role)}`}
                          >
                            {getRoleIcon(membership.role)}
                            <span className="ml-1">
                              {formatRole(membership.role)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {member.identifier}
                          </p>
                          <p className="text-sm hidden text-muted-foreground md:flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Joined{" "}
                            {new Date(
                              membership.createdAt
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem className="text-sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-sm"
                          onClick={() =>
                            navigator.clipboard.writeText(member.identifier)
                          }
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Email
                        </DropdownMenuItem>
                        {member.userId !== user?.id &&
                          userMembership?.role === "org:admin" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-sm"
                                onClick={() => {}}
                              >
                                <Settings className="w-4 h-4 mr-2" />
                                {membership.role === "org:admin"
                                  ? "Make Member"
                                  : "Make Admin"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-sm text-red-600"
                                onClick={() => {}}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remove Member
                              </DropdownMenuItem>
                            </>
                          )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Member;
