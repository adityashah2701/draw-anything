"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";
import { useComments } from "@/features/whiteboard/hooks/data/use-comments";
import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  cardPosition,
  friendlyError,
  isSendKey,
  relativeTime,
  visibleThreads,
  worldToScreen,
  type CommentDto,
  type Thread,
} from "@/features/whiteboard/utils/comments";

const CARD = { width: 300, height: 260 };

interface CommentLayerProps {
  whiteboardId: string | undefined;
  zoom: number;
  panOffset: Point;
  stageSize: { width: number; height: number };
  canEdit: boolean;
  /** A new thread being written, placed by the comment tool. */
  draft: Point | null;
  onDraftChange: (draft: Point | null) => void;
}

const Message = ({ comment, now }: { comment: CommentDto; now: number }) => (
  <div className="flex gap-2">
    <span
      aria-hidden
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-foreground"
    >
      {comment.authorName.slice(0, 1).toUpperCase()}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.mine ? "You" : comment.authorName}</span> · {relativeTime(comment.createdAt, now)}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">{comment.text}</p>
    </div>
  </div>
);

/** Textarea where Enter sends and Shift+Enter adds a line. Keeps what was typed if sending fails. */
const Composer = ({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel?: () => void;
}) => {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Not the autoFocus attribute: the click that opened the composer would move focus off it afterwards.
  useEffect(() => {
    if (!autoFocus) return;
    const id = window.setTimeout(() => fieldRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [autoFocus]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(text);
      setText("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={fieldRef}
        value={text}
        rows={2}
        maxLength={2000}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel?.();
          } else if (isSendKey(e.nativeEvent)) {
            e.preventDefault();
            void send();
          }
        }}
        className="w-full resize-none rounded-md border border-border bg-muted/40 px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!text.trim() || sending}
          onClick={() => void send()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

const card = "pointer-events-auto absolute z-40 flex w-[300px] flex-col gap-3 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg";

export function CommentLayer({ whiteboardId, zoom, panOffset, stageSize, canEdit, draft, onDraftChange }: CommentLayerProps) {
  const comments = useComments(whiteboardId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const now = Date.now();
  const resolvedCount = useMemo(() => comments.threads.filter((t) => t.root.resolved).length, [comments.threads]);
  const shown = useMemo(() => visibleThreads(comments.threads, showResolved), [comments.threads, showResolved]);
  const open = comments.threads.find((t) => t.root._id === openId) ?? null;

  // Click outside, or Escape, closes an open thread (a draft is only cancelled by its own buttons or Escape).
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest("[data-comment-ui]")) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const pinAt = (thread: Thread) => worldToScreen(thread.root, zoom, panOffset);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[35] overflow-hidden" data-comment-layer>
      {shown.map((thread) => {
        const at = pinAt(thread);
        const replies = thread.replies.length;
        return (
          <button
            key={thread.root._id}
            type="button"
            data-comment-ui
            aria-label={`Comment by ${thread.root.authorName}: ${thread.root.text.slice(0, 60)}${replies ? `, ${replies} ${replies === 1 ? "reply" : "replies"}` : ""}${thread.root.resolved ? ", resolved" : ""}`}
            aria-expanded={openId === thread.root._id}
            onClick={() => setOpenId(openId === thread.root._id ? null : thread.root._id)}
            style={{ left: at.x, top: at.y }}
            className={`pointer-events-auto absolute flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none border border-border bg-popover text-foreground shadow-md transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring ${
              thread.root.resolved ? "opacity-50" : ""
            } ${openId === thread.root._id ? "ring-2 ring-ring" : ""}`}
          >
            {thread.root.resolved ? <Check size={14} aria-hidden /> : <MessageSquare size={14} aria-hidden />}
            {replies > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {replies}
              </span>
            )}
          </button>
        );
      })}

      {resolvedCount > 0 && (
        <button
          type="button"
          data-comment-ui
          aria-pressed={showResolved}
          onClick={() => setShowResolved((v) => !v)}
          className="pointer-events-auto absolute bottom-4 left-16 rounded-full border border-border bg-popover px-3 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground"
        >
          {showResolved ? "Hide" : "Show"} resolved ({resolvedCount})
        </button>
      )}

      {open && (
        (() => {
          const p = cardPosition(pinAt(open), CARD, stageSize);
          const mineRoot = open.root.mine;
          return (
            <div data-comment-ui role="dialog" aria-label="Comment thread" style={{ left: p.x, top: p.y }} className={card}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{open.root.resolved ? "Resolved thread" : "Thread"}</span>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void comments.setResolved(open.root._id, !open.root.resolved)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {open.root.resolved ? <RotateCcw size={12} aria-hidden /> : <Check size={12} aria-hidden />}
                      {open.root.resolved ? "Reopen" : "Resolve"}
                    </button>
                  )}
                  {canEdit && mineRoot && (
                    <button
                      type="button"
                      aria-label="Delete thread"
                      onClick={() => {
                        void comments.remove(open.root._id);
                        setOpenId(null);
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                  <button type="button" aria-label="Close thread" onClick={() => setOpenId(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </div>
              <div className="flex max-h-[200px] flex-col gap-3 overflow-y-auto">
                {[open.root, ...open.replies].map((comment) => (
                  <div key={comment._id} className="group relative">
                    <Message comment={comment} now={now} />
                    {canEdit && comment.mine && comment._id !== open.root._id && (
                      <button
                        type="button"
                        aria-label="Delete reply"
                        onClick={() => void comments.remove(comment._id)}
                        className="absolute right-0 top-0 hidden rounded-md p-1 text-muted-foreground hover:text-destructive group-hover:block focus-visible:block"
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <Composer placeholder="Reply…" submitLabel="Reply" onSubmit={(text) => comments.reply(open.root._id, text)} />
              )}
            </div>
          );
        })()
      )}

      {draft && canEdit && (
        (() => {
          const at = worldToScreen(draft, zoom, panOffset);
          const p = cardPosition(at, { width: CARD.width, height: 150 }, stageSize);
          return (
            <>
              <span
                aria-hidden
                style={{ left: at.x, top: at.y }}
                className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none border border-border bg-primary text-primary-foreground shadow-md"
              >
                <MessageSquare size={14} />
              </span>
              <div data-comment-ui role="dialog" aria-label="New comment" style={{ left: p.x, top: p.y }} className={card}>
                <Composer
                  autoFocus
                  placeholder="Add a comment…"
                  submitLabel="Comment"
                  onCancel={() => onDraftChange(null)}
                  onSubmit={async (text) => {
                    const id = await comments.startThread(draft.x, draft.y, text);
                    onDraftChange(null);
                    setOpenId(String(id));
                  }}
                />
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}
