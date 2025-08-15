import { useQuery } from "convex/react";

export const useApiQuery = (queryFunc: any, args?: any) => {
  const data = useQuery(queryFunc, args);

  const isPending = data === undefined;

  return {
    data: data || [],
    isPending,
  };
};
