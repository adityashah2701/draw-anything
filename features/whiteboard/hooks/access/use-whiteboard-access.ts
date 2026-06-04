import { useEffect, useState } from "react";
import { useOrganization } from "@clerk/nextjs";

export const useWhiteboardAccess = (whiteboard: any) => {
  const [hasEditAccess, setHasEditAccess] = useState(true);
  const { organization } = useOrganization();

  useEffect(() => {
    if (whiteboard && organization) {
      const hasAccess = whiteboard.orgId === organization.id;
      setHasEditAccess(hasAccess);

      if (!hasAccess) {
        console.warn("You don't have edit access to this whiteboard");
      }
    }
  }, [whiteboard, organization]);

  const checkAccess = (action: string): boolean => {
    if (!hasEditAccess) {
      console.warn(`You don't have permission to ${action} this whiteboard.`);
      return false;
    }
    return true;
  };

  const requireAccess = (action: string): boolean => {
    if (!hasEditAccess) {
      throw new Error(`You don't have permission to ${action} this whiteboard.`);
    }
    return true;
  };

  return {
    hasEditAccess,
    organization,
    checkAccess,
    requireAccess,
  };
};