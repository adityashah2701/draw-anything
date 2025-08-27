import { Building2, Users } from "lucide-react";

const NoOrganizationState = () => {
  return (
    <div className="flex-1 ml-20 lg:ml-0 bg-gray-50 min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome to Draw Anything
          </h2>

          <p className="text-gray-600 mb-8">
            To get started with creating and managing whiteboards, you need to
            create or join an organization.
          </p>

          <div className="space-y-4">
            <div className="text-sm text-gray-500">
              <p>
                Or use the organization switcher above to join an existing one
              </p>
            </div>
          </div>

          {/* Features Preview */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">
                Create Whiteboards
              </h3>
              <p className="text-sm text-gray-600">
                Design and collaborate on unlimited whiteboards
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">
                Team Collaboration
              </h3>
              <p className="text-sm text-gray-600">
                Invite team members and work together in real-time
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoOrganizationState;