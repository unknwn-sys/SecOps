import { getLoginUrl, getAuthToken, clearAuthToken } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      // Store token in localStorage
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
      }
      // Update user in cache
      utils.auth.me.setData(undefined, {
        id: data.user.id,
        username: data.user.username,
        name: data.user.name,
        role: data.user.role,
      } as any);
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      clearAuthToken();
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        clearAuthToken();
        return;
      }
      throw error;
    } finally {
      clearAuthToken();
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const login = useCallback(
    async (username: string, password: string) => {
      return loginMutation.mutateAsync({ username, password });
    },
    [loginMutation]
  );

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (meQuery.data) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [meQuery.isLoading, meQuery.data, redirectOnUnauthenticated, redirectPath, logoutMutation.isPending]);

  const state = useMemo(() => {
    const userInfo = meQuery.data ?? null;
    localStorage.setItem("auth-user-info", JSON.stringify(userInfo));
    return {
      user: userInfo,
      isLoading: meQuery.isLoading || logoutMutation.isPending,
      isError: meQuery.isError,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      logout,
      login,
      loginMutation,
      refresh: () => meQuery.refetch(),
    };
  }, [meQuery.data, meQuery.isLoading, meQuery.isError, meQuery.error, logoutMutation.isPending, logoutMutation.error, logout, login, loginMutation]);

  return state;
}
