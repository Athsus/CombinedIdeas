import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentSession, signInWithGoogle, signOut, supabase } from "./supabase";

type AuthContextValue = {
  isReady: boolean;
  isConfigured: boolean;
  session: Session | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getCurrentSession()
      .then((currentSession) => {
        if (!isMounted) {
          return;
        }

        setSession(currentSession);
        setIsReady(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIsReady(true);
      });

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isConfigured: Boolean(supabase),
      session,
      signIn: signInWithGoogle,
      signOut,
    }),
    [isReady, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}
