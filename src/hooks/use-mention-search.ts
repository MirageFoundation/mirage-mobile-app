import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/src/api/client";
import {
  isAbortError,
  RequestGenerationCoordinator,
  type RequestGeneration,
} from "@/src/utils/request-generation";
import * as Sentry from "@sentry/react-native";

interface MentionUser {
  username: string;
  address: string;
}

interface SearchUsernameResponse {
  results: MentionUser[];
}

interface UseMentionSearchResult {
  mentionQuery: string;
  mentionResults: MentionUser[];
  mentionOpen: boolean;
  mentionLoading: boolean;
  mentionStartIndex: number;
  detectMention: (text: string, cursorPos: number) => void;
  insertMention: (
    username: string,
    text: string,
    cursorPos: number,
  ) => { newText: string; newCursorPos: number };
  closeMention: () => void;
}

const DEBOUNCE_DELAY = 750;

export function useMentionSearch(): UseMentionSearchResult {
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionStartRef = useRef(-1);
  const coordinatorRef = useRef(new RequestGenerationCoordinator());
  const activeSearchRef = useRef<RequestGeneration | null>(null);
  const activeQueryRef = useRef<string | null>(null);

  const clearActiveSearch = useCallback(() => {
    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    mentionTimerRef.current = null;
    coordinatorRef.current.invalidate();
    activeSearchRef.current = null;
    activeQueryRef.current = null;
    setMentionLoading(false);
  }, []);

  const detectMention = useCallback((text: string, cursorPos: number) => {
    if (!text || cursorPos <= 0) {
      clearActiveSearch();
      setMentionQuery("");
      setMentionResults([]);
      setMentionOpen(false);
      return;
    }

    let i = cursorPos - 1;
    while (i >= 0 && /[A-Za-z0-9_-]/.test(text[i])) {
      i--;
    }
    if (i < 0 || text[i] !== "@") {
      clearActiveSearch();
      setMentionQuery("");
      setMentionResults([]);
      setMentionOpen(false);
      return;
    }

    if (i > 0 && /\w/.test(text[i - 1])) {
      clearActiveSearch();
      setMentionQuery("");
      setMentionResults([]);
      setMentionOpen(false);
      return;
    }

    const query = text.slice(i + 1, cursorPos).toLowerCase();
    mentionStartRef.current = i;

    if (query.length === 0) {
      clearActiveSearch();
      setMentionQuery("");
      setMentionResults([]);
      setMentionOpen(true);
      return;
    }

    if (activeQueryRef.current !== query) {
      activeQueryRef.current = query;
      activeSearchRef.current = coordinatorRef.current.activate(query);
    }
    setMentionQuery(query);
    setMentionOpen(true);
    setMentionLoading(true);
  }, [clearActiveSearch]);

  useEffect(() => {
    if (!mentionOpen || !mentionQuery || mentionQuery.length < 1) {
      if (!mentionOpen) {
        setMentionResults([]);
      }
      setMentionLoading(false);
      return;
    }

    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);

    mentionTimerRef.current = setTimeout(async () => {
      const activeSearch = activeSearchRef.current;
      if (!activeSearch) return;
      const token = coordinatorRef.current.start(activeSearch);
      if (!token) return;

      try {
        const res = await api.get<SearchUsernameResponse>(
          "/search_username",
          { q: mentionQuery, limit: 8 },
          { signal: token.signal },
        );
        if (
          coordinatorRef.current.isCurrent(token) &&
          res &&
          Array.isArray(res.results)
        ) {
          setMentionResults(res.results);
          Sentry.addBreadcrumb({
            category: "mention",
            message: "Username search completed",
            data: { resultCount: res.results.length },
            level: "info",
          });
        }
      } catch (error) {
        if (!coordinatorRef.current.isCurrent(token) || isAbortError(error)) return;
        setMentionResults([]);
        Sentry.addBreadcrumb({
          category: "mention",
          message: "Username search failed",
          level: "warning",
        });
      } finally {
        if (coordinatorRef.current.isCurrent(token)) {
          setMentionLoading(false);
          coordinatorRef.current.settle(token);
        }
      }
    }, DEBOUNCE_DELAY);

    return () => {
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    };
  }, [mentionQuery, mentionOpen]);

  useEffect(
    () => () => {
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
      coordinatorRef.current.invalidate();
    },
    [],
  );

  const insertMention = useCallback(
    (username: string, text: string, cursorPos: number) => {
      const atPos = mentionStartRef.current;
      if (atPos < 0) {
        setMentionOpen(false);
        return { newText: text, newCursorPos: cursorPos };
      }

      const before = text.slice(0, atPos);
      const after = text.slice(cursorPos);
      const insert = `@${username} `;
      const newText = before + insert + after;
      const newCursorPos = atPos + insert.length;

      setMentionOpen(false);
      setMentionQuery("");
      setMentionResults([]);
      clearActiveSearch();

      Sentry.addBreadcrumb({
        category: "mention",
        message: "Inserted mention",
        level: "info",
      });

      return { newText, newCursorPos };
    },
    [clearActiveSearch],
  );

  const closeMention = useCallback(() => {
    clearActiveSearch();
    setMentionOpen(false);
    setMentionQuery("");
    setMentionResults([]);
  }, [clearActiveSearch]);

  return {
    mentionQuery,
    mentionResults,
    mentionOpen,
    mentionLoading,
    mentionStartIndex: mentionStartRef.current,
    detectMention,
    insertMention,
    closeMention,
  };
}
