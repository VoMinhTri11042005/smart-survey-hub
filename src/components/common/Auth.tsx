import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Info, Lock, Mail } from 'lucide-react';
import { signInWithEmail, logOut } from '../../services/firebase';
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
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (allowedEmails.length === 0) {
      setError('Chưa cấu hình email quản trị. Vui lòng kiểm tra VITE_ADMIN_EMAILS.');
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    setIsSigningIn(true);
    try {
      const user = await signInWithEmail(email, password);
      if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
        await logOut();
        throw new Error('Tài khoản này chưa được cấp quyền quản trị.');
      }

      onLogin('admin', {
        name: user.displayName || user.email,
        email: user.email,
        photoURL: user.photoURL || '',
        tagline: 'Quản trị viên',
      });
    } catch (signInError) {
      console.error('Email/password sign-in failed:', signInError);
      setError(signInError instanceof Error && signInError.message === 'Tài khoản này chưa được cấp quyền quản trị.'
        ? signInError.message
        : 'Email hoặc mật khẩu không chính xác.');
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
          Đăng nhập bằng email và mật khẩu quản trị của bạn.
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
          <form className="space-y-5" onSubmit={event => void handleSubmit(event)}>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-text-primary">
                Địa chỉ Email
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-text-secondary" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  className="block w-full pl-10 pr-3 py-2.5 border border-border-subtle rounded-xl text-sm font-medium placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-text-primary">
                Mật khẩu
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-text-secondary" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="block w-full pl-10 pr-10 py-2.5 border border-border-subtle rounded-xl text-sm font-medium placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all"
                  placeholder="Nhập mật khẩu"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
            >
              {isSigningIn ? 'Đang đăng nhập...' : 'Đăng nhập'}
              {!isSigningIn && <ArrowRight size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
