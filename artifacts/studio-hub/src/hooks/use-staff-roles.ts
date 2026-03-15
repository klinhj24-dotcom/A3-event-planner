import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Request failed");
  }
  return res.json();
}

export type StaffRoleType = { id: number; name: string; color: string | null; sortOrder: number };

export function useStaffRoleTypes() {
  return useQuery({
    queryKey: ["/api/staff-role-types"],
    queryFn: () => apiFetch<StaffRoleType[]>("/api/staff-role-types"),
  });
}

export function useCreateStaffRoleType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      apiFetch<StaffRoleType>("/api/staff-role-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/staff-role-types"] }),
  });
}

export function useUpdateStaffRoleType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; color?: string; sortOrder?: number }) =>
      apiFetch<StaffRoleType>(`/api/staff-role-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/staff-role-types"] }),
  });
}

export function useDeleteStaffRoleType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/staff-role-types/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/staff-role-types"] }),
  });
}
