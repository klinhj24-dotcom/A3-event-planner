import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ── Google connection status ──────────────────────────────────────────────────

export function useGoogleStatus() {
  return useQuery({
    queryKey: ["/api/auth/google/status"],
    queryFn: () => apiFetch<{ connected: boolean; googleEmail: string | null }>("/api/auth/google/status"),
  });
}

export function useGoogleDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/google/disconnect", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/google/status"] }),
  });
}

// ── Gmail ─────────────────────────────────────────────────────────────────────

type SendEmailPayload = {
  contactId?: number;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  replyToMessageId?: string;
  eventId?: number;
};

export function useGmailSend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendEmailPayload) =>
      apiFetch<{ success: boolean; threadId: string; messageId: string }>("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, vars) => {
      if (vars.contactId) {
        queryClient.invalidateQueries({ queryKey: [`/api/gmail/contact/${vars.contactId}/threads`] });
        queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      }
    },
  });
}

export function useContactThreads(contactId: number | null) {
  return useQuery({
    queryKey: [`/api/gmail/contact/${contactId}/threads`],
    queryFn: () => apiFetch<any[]>(`/api/gmail/contact/${contactId}/threads`),
    enabled: !!contactId,
  });
}

export function useGmailThread(threadId: string | null) {
  return useQuery({
    queryKey: [`/api/gmail/thread/${threadId}`],
    queryFn: () => apiFetch<{ threadId: string; messages: any[] }>(`/api/gmail/thread/${threadId}`),
    enabled: !!threadId,
  });
}

export function useImportThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, threadId }: { contactId: number; threadId: string }) =>
      apiFetch<{ success: boolean; imported: boolean; message?: string; subject?: string; messageCount?: number }>(
        "/api/gmail/import-thread",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId, threadId }),
        }
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/gmail/contact/${vars.contactId}/threads`] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
  });
}

// ── Email Templates ───────────────────────────────────────────────────────────

export type EmailTemplate = { id: number; name: string; subject: string; body: string };

export function useEmailTemplates() {
  return useQuery({
    queryKey: ["/api/email-templates"],
    queryFn: () => apiFetch<EmailTemplate[]>("/api/email-templates"),
  });
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; subject: string; body: string }) =>
      apiFetch<EmailTemplate>("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] }),
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] }),
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export function useCalendarPush(eventId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/calendar/push/${eventId}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
  });
}
