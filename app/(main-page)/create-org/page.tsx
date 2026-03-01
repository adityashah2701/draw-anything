import { CreateOrgForm } from "@/features/organizations/components/create-org-form";
import { Building2 } from "lucide-react";

export default function CreateOrganizationPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Create an Organization
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Build your team workspace to collaborate with others.
          </p>
        </div>
        <CreateOrgForm />
      </div>
    </div>
  );
}
