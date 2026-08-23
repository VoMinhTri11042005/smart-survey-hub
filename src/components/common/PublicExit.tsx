import React from 'react';

export function PublicExit() {
  const publicUrl = (import.meta as any).env.VITE_PUBLIC_APP_URL || '/';

  return (
    <div className="min-h-screen bg-surface-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-text-primary mb-3">Cảm ơn bạn đã tham gia khảo sát</h1>
        <p className="text-text-secondary mb-6">Phản hồi của bạn đã được ghi nhận. Bạn có thể đóng trang này hoặc quay về trang chủ.</p>
        <div className="flex justify-center gap-3">
          <a href={publicUrl} className="px-5 py-3 rounded-xl bg-primary text-white font-semibold">Về trang chủ</a>
          <button onClick={() => window.close()} className="px-5 py-3 rounded-xl border border-border-subtle text-text-primary">Đóng</button>
        </div>
      </div>
    </div>
  );
}
