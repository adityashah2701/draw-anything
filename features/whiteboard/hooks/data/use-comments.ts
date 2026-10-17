import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { groupThreads, type CommentDto } from "@/features/whiteboard/utils/comments";

/** Live comment threads for a board, and the four things a person can do to them. */
export const useComments = (whiteboardId: string | undefined) => {
  const comments = useQuery(
    api.comments.list,
    whiteboardId ? { whiteboardId: whiteboardId as Id<"whiteboards"> } : "skip",
  ) as CommentDto[] | undefined;
  const create = useMutation(api.comments.create);
  const reply = useMutation(api.comments.reply);
  const setResolved = useMutation(api.comments.setResolved);
  const remove = useMutation(api.comments.remove);

  const threads = useMemo(() => groupThreads(comments ?? []), [comments]);

  return {
    loading: comments === undefined,
    threads,
    startThread: (x: number, y: number, text: string) =>
      create({ whiteboardId: whiteboardId as Id<"whiteboards">, x, y, text }),
    reply: (threadId: string, text: string) => reply({ threadId: threadId as Id<"comments">, text }),
    setResolved: (threadId: string, resolved: boolean) =>
      setResolved({ threadId: threadId as Id<"comments">, resolved }),
    remove: (commentId: string) => remove({ commentId: commentId as Id<"comments"> }),
  };
};
