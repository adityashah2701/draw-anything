import { useState } from "react";
import { useMutation } from "convex/react";

export const useApiMutation = (mutationFunc: any) => {
  const [isPending, setIsPending] = useState(false);
  const apiMutation = useMutation(mutationFunc);

  const mutate = async (payload: any) => {
    try {
      setIsPending(true);
      return apiMutation(payload);
    } catch (error) {
      throw error;
    } finally {
      setIsPending(false);
    }
  };

  return {
    isPending,
    mutate,
  };
};
