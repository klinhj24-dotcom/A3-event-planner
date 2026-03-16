import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { user: AuthUser | null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Login failed" };
      setUser(data.user);
      return {};
    } catch {
      return { error: "Network error, please try again" };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    setUser(null);
    window.location.href = "/login";
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refetch: fetchUser,
  };
}
