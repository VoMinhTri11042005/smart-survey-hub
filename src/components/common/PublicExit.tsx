import React from 'react';

export function PublicExit() {
  const publicUrl = (import.meta as any).env.VITE_PUBLIC_APP_URL || '';

  const tryClose = () => {
    // Try to close the window/tab (works if opened by script); otherwise fall back to about:blank
    try {
      window.open('', '_self');
      window.close();
      setTimeout(() => {
        // if still not closed, navigate to a neutral blank page
        window.location.replace('about:blank');
      }, 300);
    } catch (e) {
      window.location.replace('about:blank');
    }
  };

  const goSafe = () => {
    if (publicUrl && publicUrl !== '/') {
      window.location.replace(publicUrl);
    } else {
      // If no explicit public site is configured, navigate to about:blank to avoid admin UI
      window.location.replace('about:blank');
    }
  };

  return (
    <div className="min-h-screen bg-surface-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-text-primary mb-3">Cảm ơn bạn đã tham gia khảo sát</h1>
        <p className="text-text-secondary mb-6">Phản hồi của bạn đã được ghi nhận. Bạn có thể đóng trang này hoặc tiếp tục tới một trang an toàn.</p>
        <div className="flex justify-center gap-3">
          <button onClick={goSafe} className="px-5 py-3 rounded-xl bg-primary text-white font-semibold">Đi tới trang an toàn</button>
          <button onClick={tryClose} className="px-5 py-3 rounded-xl border border-border-subtle text-text-primary">Đóng</button>
        </div>
      </div>
    </div>
  );
}
