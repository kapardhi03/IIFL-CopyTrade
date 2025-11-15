import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { auditAuth } from '../lib/auditLog';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'master' | 'follower';
  phone?: string;
  isEmailVerified: boolean;
  isKYCVerified: boolean;
  has2FAEnabled: boolean;
  onboardingCompleted: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWith2FA: (code: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
}

export interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'master' | 'follower';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempCredentials, setTempCredentials] = useState<{ email: string; password: string } | null>(null);

  // Helper function to fetch user profile from database
  const fetchUserProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (profile) {
        const userData: User = {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          phone: profile.phone || undefined,
          isEmailVerified: profile.is_email_verified,
          isKYCVerified: profile.is_kyc_verified,
          has2FAEnabled: profile.has_2fa_enabled,
          onboardingCompleted: profile.onboarding_completed,
        };
        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Check for existing session on mount
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await fetchUserProfile(session.user.id);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await fetchUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);

      // Sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Fetch user profile
        await fetchUserProfile(data.user.id);

        // Check if user has 2FA enabled
        const { data: profile } = await supabase
          .from('profiles')
          .select('has_2fa_enabled')
          .eq('id', data.user.id)
          .single();

        if (profile?.has_2fa_enabled) {
          setTempCredentials({ email, password });
          setNeeds2FA(true);
          // Sign out temporarily until 2FA is verified
          await supabase.auth.signOut();
          throw new Error('2FA_REQUIRED');
        }

        // Log successful login
        auditAuth.login(data.user.id, email);
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWith2FA = async (code: string) => {
    try {
      setIsLoading(true);

      if (!tempCredentials) {
        throw new Error('No pending 2FA login');
      }

      // TODO: Verify 2FA code with API
      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockUser: User = {
        id: '1',
        email: tempCredentials.email,
        name: 'Test User',
        role: 'master',
        phone: '+91 98765 43210',
        isEmailVerified: true,
        isKYCVerified: false,
        has2FAEnabled: true,
        onboardingCompleted: false,
      };

      setUser(mockUser);
      localStorage.setItem('user', JSON.stringify(mockUser));
      setNeeds2FA(false);
      setTempCredentials(null);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true);

      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            role: data.role,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create user profile in profiles table
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: data.email,
            name: data.name,
            role: data.role,
            phone: data.phone || null,
            is_email_verified: false,
            is_kyc_verified: false,
            has_2fa_enabled: false,
            onboarding_completed: false,
          });

        if (profileError) throw profileError;

        // Fetch the newly created profile
        await fetchUserProfile(authData.user.id);

        // Log user registration
        auditAuth.register(authData.user.id, data.email, data.role);
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    // Log logout before clearing user state
    if (user) {
      auditAuth.logout(user.id);
    }

    await supabase.auth.signOut();
    setUser(null);
    setNeeds2FA(false);
    setTempCredentials(null);
  };

  const updateUser = async (data: Partial<User>) => {
    if (user) {
      // Map User fields to database column names
      const dbData: Record<string, any> = {};

      if (data.name !== undefined) dbData.name = data.name;
      if (data.phone !== undefined) dbData.phone = data.phone;
      if (data.role !== undefined) dbData.role = data.role;
      if (data.isEmailVerified !== undefined) dbData.is_email_verified = data.isEmailVerified;
      if (data.isKYCVerified !== undefined) dbData.is_kyc_verified = data.isKYCVerified;
      if (data.has2FAEnabled !== undefined) dbData.has_2fa_enabled = data.has2FAEnabled;
      if (data.onboardingCompleted !== undefined) dbData.onboarding_completed = data.onboardingCompleted;

      // Update profile in database
      const { error } = await supabase
        .from('profiles')
        .update(dbData)
        .eq('id', user.id);

      if (error) {
        console.error('Failed to update user profile:', error);
        throw error;
      }

      // Update local state
      const updatedUser = { ...user, ...data };
      setUser(updatedUser);

      // Log profile update
      auditAuth.profileUpdated(user.id, data);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setIsLoading(true);

      // Send password reset email via Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      // Log password reset request (if user exists, will be logged in backend)
      // For security, we don't log this on client-side without user ID
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmail = async (token: string) => {
    try {
      setIsLoading(true);

      // Verify email with Supabase
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'email',
      });

      if (error) throw error;

      // Update user profile
      if (user) {
        await updateUser({ isEmailVerified: true });
        // Log email verification
        auditAuth.emailVerified(user.id);
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginWith2FA,
    register,
    logout,
    updateUser,
    resetPassword,
    verifyEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
