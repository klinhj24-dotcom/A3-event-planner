import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Request failed");
  }
  return res.json();
}

export type EventType = { id: number; name: string; sortOrder: number; isActive: boolean };

export function useEventTypes() {
  return useQuery({
    queryKey: ["/api/event-types/all"],
    queryFn: () => apiFetch<EventType[]>("/api/event-types/all"),
  });
}

export function useActiveEventTypes() {
  return useQuery({
    queryKey: ["/api/event-types"],
    queryFn: () => apiFetch<EventType[]>("/api/event-types"),
  });
}

export function useCreateEventType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<EventType>("/api/event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/event-types"] });
      qc.invalidateQueries({ queryKey: ["/api/event-types/all"] });
    },
  });
}

export function useUpdateEventType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, isActive }: { id: number; name?: string; isActive?: boolean }) =>
      apiFetch<EventType>(`/api/event-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isActive }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/event-types"] });
      qc.invalidateQueries({ queryKey: ["/api/event-types/all"] });
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      qc.invalidateQueries({ queryKey: ["/api/comm-schedule/rules"] });
    },
  });
}

export function useDeleteEventType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/event-types/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/event-types"] });
      qc.invalidateQueries({ queryKey: ["/api/event-types/all"] });
    },
  });
}
