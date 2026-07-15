import { useState } from 'react';
import { Mail, Lock, ArrowRight, Info, User, Settings, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Role } from '../../types';
import { signInWithGoogle } from '../../services/firebase';

interface AuthProps {
  onLogin: (role: Role, user?: { name: string; email: string; photoURL: string }) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<Role>('admin');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      onLogin(role, {
        name: user.displayName || 'Người dùng',
        email: user.email || '',
        photoURL: user.photoURL || '',
      });
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed popup, do nothing
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain chưa được cấp phép. Vui lòng thêm "localhost" vào Firebase Console > Authentication > Settings > Authorized domains.');
      } else {
        setError('Đăng nhập Google thất bại. Vui lòng thử lại.');
        console.error('Google login error:', err);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 mb-6">
          <span className="font-display text-3xl font-bold text-white tracking-tight">SH</span>
        </div>
        <h2 className="text-center font-display text-3xl font-bold tracking-tight text-text-primary">
          {isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}
        </h2>
        <p className="mt-2 text-center text-sm text-text-secondary font-medium">
          {isLogin ? 'Đăng nhập để truy cập không gian làm việc của bạn.' : 'Bắt đầu quản lý các khảo sát thông minh hơn ngay hôm nay.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="bg-white py-8 px-4 shadow-xl shadow-primary/5 sm:rounded-3xl sm:px-10 border border-border-subtle">
          
          {error && (
            <div className="mb-6 p-4 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-xl flex items-start gap-3">
              <Info size={18} className="text-sentiment-negative flex-shrink-0 mt-0.5" />
              <p className="text-sm text-sentiment-negative font-medium">{error}</p>
            </div>
          )}

          {/* Role Selector */}
          <div className="mb-8 flex p-1 bg-surface-container-low rounded-xl border border-border-subtle">
            <button
              onClick={() => setRole('admin')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${role === 'admin' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Settings size={16} /> Admin (Người tạo)
            </button>
            <button
              onClick={() => setRole('user')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${role === 'user' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <User size={16} /> User (Người dùng)
            </button>
          </div>

          {/* Google Login - Primary (Only for users) */}
          {role === 'user' && (
            <>
              <button 
                type="button" 
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
                className="w-full inline-flex justify-center items-center gap-3 py-3.5 px-4 border-2 border-border-subtle rounded-xl shadow-sm bg-white text-base font-bold text-text-primary hover:bg-surface-container-low hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <RefreshCw size={20} className="animate-spin text-primary" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {isGoogleLoading ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}
              </button>

              {/* Divider */}
              <div className="mt-8 mb-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border-subtle" />
                  </div>
                  <div className="relative flex justify-center text-sm font-medium">
                    <span className="px-2 bg-white text-text-secondary">Hoặc đăng nhập bằng email</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Email/Password Form */}
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onLogin(role); }}>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-text-primary">
                Địa chỉ Email
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-text-secondary" />
                </div>
                <input
                  id="email" name="email" type="email" autoComplete="email" required
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
                  id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                  className="block w-full pl-10 pr-10 py-2.5 border border-border-subtle rounded-xl text-sm font-medium placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all active:scale-[0.98] cursor-pointer"
            >
              {isLogin ? 'Đăng nhập' : 'Đăng ký'}
              <ArrowRight size={18} />
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm font-medium">
            <span className="text-text-secondary">
              {isLogin ? "Bạn chưa có tài khoản? " : "Bạn đã có tài khoản? "}
            </span>
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              className="font-bold text-primary hover:text-primary-container transition-colors cursor-pointer"
            >
              {isLogin ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          </div>

          <p className="mt-4 text-center text-[10px] text-text-secondary font-medium opacity-60">
            Đăng nhập bằng email hiện ở chế độ Demo — bất kỳ thông tin nào cũng được chấp nhận.
          </p>
        </div>
      </div>
    </div>
  );
}
