import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api";

export interface TeamMember {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  googleEmail: string | null;
  createdAt: string;
}

export interface ContactAssignment {
  id: number;
  userId: string;
  assignedAt: string;
  assignedBy: string | null;
  autoAssigned: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  username: string | null;
  profileImageUrl: string | null;
}

export function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team members");
      return res.json();
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await fetch(`${BASE}/users/${id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });
}

export function useContactAssignments(contactId: number | null) {
  return useQuery<ContactAssignment[]>({
    queryKey: [`/api/contacts/${contactId}/assignments`],
    queryFn: async () => {
      const res = await fetch(`${BASE}/contacts/${contactId}/assignments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json();
    },
    enabled: !!contactId,
  });
}

export function useAssignContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, userId }: { contactId: number; userId: string }) => {
      const res = await fetch(`${BASE}/contacts/${contactId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to assign contact");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${vars.contactId}/assignments`] });
    },
  });
}

export function useUnassignContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, userId }: { contactId: number; userId: string }) => {
      const res = await fetch(`${BASE}/contacts/${contactId}/assignments/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to unassign contact");
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${vars.contactId}/assignments`] });
    },
  });
}

export function useCommRules() {
  return useQuery({
    queryKey: ["/api/comm-schedule/rules"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/comm-schedule/rules`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comm rules");
      return res.json() as Promise<CommRule[]>;
    },
  });
}

export function useCreateCommRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<CommRule, "id" | "isActive">) => {
      const res = await fetch(`${BASE}/comm-schedule/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to create rule");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comm-schedule/rules"] });
    },
  });
}

export function useUpdateCommRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CommRule> & { id: number }) => {
      const res = await fetch(`${BASE}/comm-schedule/rules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to update rule");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comm-schedule/rules"] });
    },
  });
}

export function useDeleteCommRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/comm-schedule/rules/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete rule");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comm-schedule/rules"] });
    },
  });
}

export interface CommRule {
  id: number;
  eventType: string;
  eventTagGroup: string | null;
  eventTag: string | null;
  commType: string;
  messageName: string | null;
  timingDays: number;
  channel: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface CommTask {
  id: number;
  eventId: number;
  ruleId: number | null;
  commType: string;
  messageName: string | null;
  channel: string | null;
  dueDate: string | null;
  googleCalendarEventId: string | null;
  status: string;
  notes: string | null;
}

export function useCommTasks(eventId: number | null) {
  return useQuery<CommTask[]>({
    queryKey: [`/api/comm-schedule/tasks`, eventId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/comm-schedule/tasks?eventId=${eventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comm tasks");
      return res.json();
    },
    enabled: !!eventId,
  });
}

export function useGenerateCommTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: number) => {
      const res = await fetch(`${BASE}/comm-schedule/tasks/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to generate tasks");
      }
      return res.json();
    },
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/comm-schedule/tasks`, eventId] });
    },
  });
}

export function useSendLateReport() {
  return useMutation({
    mutationFn: async (to?: string) => {
      const res = await fetch(`${BASE}/comm-schedule/tasks/late-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to send late report");
      }
      return res.json();
    },
  });
}

export function useUpdateCommTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, eventId, status, notes }: { id: number; eventId: number; status?: string; notes?: string }) => {
      const res = await fetch(`${BASE}/comm-schedule/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/comm-schedule/tasks`, vars.eventId] });
    },
  });
}

export interface EventDebrief {
  id: number;
  eventId: number;
  timeIn: string | null;
  timeOut: string | null;
  greyInvolved: boolean | null;
  staffPresent: string | null;
  crowdSize: number | null;
  boothPlacement: string | null;
  soundSetupNotes: string | null;
  whatWorked: string | null;
  whatDidntWork: string | null;
  leadQuality: string | null;
  wouldRepeat: boolean | null;
  improvements: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useEventDebrief(eventId: number | null) {
  return useQuery<EventDebrief | null>({
    queryKey: [`/api/events/${eventId}/debrief`],
    queryFn: async () => {
      if (!eventId) return null;
      const res = await fetch(`${BASE}/events/${eventId}/debrief`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load debrief");
      return res.json();
    },
    enabled: !!eventId,
  });
}

export function useUpsertDebrief(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Omit<EventDebrief, "id" | "eventId" | "createdAt" | "updatedAt">>) => {
      const res = await fetch(`${BASE}/events/${eventId}/debrief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save debrief");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/debrief`] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
  });
}

export function useUpdateEventImage(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (imageUrl: string | null) => {
      const res = await fetch(`${BASE}/events/${eventId}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) throw new Error("Failed to update event image");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
  });
}
