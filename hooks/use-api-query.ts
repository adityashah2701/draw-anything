import { useQuery } from "convex/react";

export const useApiQuery = (queryFunc: any, args?: any) => {
  const shouldSkip = args === "skip" || args === null;
  
  // Pass "skip" directly to useQuery, not undefined
  const data = useQuery(queryFunc, shouldSkip ? "skip" : args);
  const isPending = !shouldSkip && data === undefined;
  
  return {
    data: data || [],
    isPending,
  };
};