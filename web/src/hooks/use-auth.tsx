import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useLogin, useRegister, useRefreshToken, useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface AuthContextType {
  token: string | null;
  user: any | null;
  login: (data: any) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();
  const refreshMutation = useRefreshToken();

  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  useEffect(() => {
    // Attempt to refresh token on mount
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      refreshMutation.mutate(
        { data: { refreshToken } },
        {
          onSuccess: (data) => {
            setToken(data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);
            sessionStorage.setItem("accessToken", data.accessToken);
          },
          onError: () => {
            localStorage.removeItem("refreshToken");
            setToken(null);
          },
        }
      );
    }
  }, []);

  const login = async (data: any) => {
    try {
      const res = await loginMutation.mutateAsync({ data });
      setToken(res.accessToken);
      setUser(res.user);
      localStorage.setItem("refreshToken", res.refreshToken);
      sessionStorage.setItem("accessToken", res.accessToken);
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Login Failed", description: err.message, variant: "destructive" });
      throw err;
    }
  };

  const register = async (data: any) => {
    try {
      const res = await registerMutation.mutateAsync({ data });
      setToken(res.accessToken);
      setUser(res.user);
      localStorage.setItem("refreshToken", res.refreshToken);
      sessionStorage.setItem("accessToken", res.accessToken);
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
      throw err;
    }
  };

  const logout = () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      logoutMutation.mutate({ data: { refreshToken } });
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem("refreshToken");
    sessionStorage.removeItem("accessToken");
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
