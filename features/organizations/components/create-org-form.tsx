"use client";

import { useState } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createCustomOrganization } from "@/app/actions/organization";
import { useRouter } from "next/navigation";

export function CreateOrgForm({ onSuccess }: { onSuccess?: () => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { setActive } = useOrganizationList();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setLoading(true);
      const res = await createCustomOrganization(name);

      if (res.success && res.organization?.id) {
        // Set the active organization to the newly created one
        if (setActive) {
          await setActive({ organization: res.organization.id });
        }
        toast.success("Organization created successfully");
        onSuccess?.();
        router.refresh(); // Refresh to catch new org in UI
        router.push("/"); // Redirect back to dashboard
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create organization",
      );
      // Could show upgrade button here later!
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="orgName" className="text-sm font-medium text-gray-700">
          Organization Name
        </label>
        <Input
          id="orgName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Corp"
          disabled={loading}
          autoFocus
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={!name.trim() || loading}
      >
        {loading ? "Creating..." : "Create Organization"}
      </Button>
    </form>
  );
}
