import { useQuery } from "convex/react";

export const useApiQuery = (queryFunc: any, args?: any) => {
  const shouldSkip = args === "skip" || args === null;
  const data = useQuery(queryFunc, shouldSkip ? undefined : args);
  const isPending = !shouldSkip && data === undefined;
  return {
    data: data || [],
    isPending,
  };
};
