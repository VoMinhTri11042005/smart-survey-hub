import { useState } from 'react';
import { Mail, Lock, ArrowRight, Info, User, Settings, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Role } from '../../types';
import { signInWithGoogle } from '../../services/firebase';

interface AuthProps {
  onLogin: (role: Role, user?: { name: string; email: string; photoURL: string }) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const role: Role = 'admin';
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);



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



          {/* Email/Password Form */}
          <form className="space-y-5" onSubmit={(e) => { 
            e.preventDefault(); 
            const formData = new FormData(e.currentTarget);
            const email = formData.get('email') as string;
            const password = formData.get('password') as string;

            if (role === 'admin') {
              if (email !== 'admin@smartsurvey.com' || password !== 'demo123456') {
                setError('Tài khoản hoặc mật khẩu Admin không chính xác.');
                return;
              }
            }
            
            setError(null);
            onLogin(role); 
          }}>
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
              Đăng nhập
              <ArrowRight size={18} />
            </button>
          </form>

          <p className="mt-6 text-center text-[10px] text-text-secondary font-medium opacity-60">
            Mặc định: admin@smartsurvey.com / demo123456
          </p>
        </div>
      </div>
    </div>
  );
}
