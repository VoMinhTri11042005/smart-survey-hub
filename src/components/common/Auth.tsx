import { useState } from 'react';
import { Info, LogIn } from 'lucide-react';
import { signInWithGoogle, logOut } from '../../services/firebase';
import type { Role, UserProfile } from '../../types';

interface AuthProps {
  onLogin: (role: Role, user: UserProfile) => void;
}

const allowedEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

export function Auth({ onLogin }: AuthProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      if (allowedEmails.length === 0) {
        throw new Error('Chưa cấu hình VITE_ADMIN_EMAILS cho tài khoản quản trị.');
      }
      const user = await signInWithGoogle();
      if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
        await logOut();
        throw new Error('Tài khoản Google này chưa được cấp quyền quản trị.');
      }
      onLogin('admin', {
        name: user.displayName || user.email,
        email: user.email,
        photoURL: user.photoURL || '',
        tagline: 'Quản trị viên',
      });
    } catch (signInError) {
      console.error('Google sign-in failed:', signInError);
      setError(signInError instanceof Error ? signInError.message : 'Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 mb-6">
          <span className="font-display text-3xl font-bold text-white tracking-tight">SH</span>
        </div>
        <h1 className="text-center font-display text-3xl font-bold tracking-tight text-text-primary">
          Đăng nhập quản trị viên
        </h1>
        <p className="mt-2 text-center text-sm text-text-secondary font-medium">
          Sử dụng tài khoản Google đã được cấp quyền để quản lý khảo sát.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-primary/5 sm:rounded-3xl sm:px-10 border border-border-subtle">
          {error && (
            <div role="alert" className="mb-6 p-4 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-xl flex items-start gap-3">
              <Info size={18} className="text-sentiment-negative flex-shrink-0 mt-0.5" />
              <p className="text-sm text-sentiment-negative font-medium">{error}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isSigningIn}
            className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-wait"
          >
            <LogIn size={18} />
            {isSigningIn ? 'Đang xác thực...' : 'Tiếp tục với Google'}
          </button>
        </div>
      </div>
    </div>
  );
}
