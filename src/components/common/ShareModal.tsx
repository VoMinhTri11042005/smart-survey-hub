import { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Link2, Mail, QrCode, ExternalLink } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  surveyId: string;
  surveyTitle: string;
}

// Simple QR Code generator using Canvas
function generateQR(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Simple QR-like pattern (visual representation)
  const size = 200;
  canvas.width = size;
  canvas.height = size;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Generate a deterministic pattern from the text
  const moduleCount = 25;
  const moduleSize = size / moduleCount;
  const hash = text.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);

  ctx.fillStyle = '#1f108e';

  // Position detection patterns (3 corners)
  const drawFinder = (x: number, y: number) => {
    ctx.fillRect(x * moduleSize, y * moduleSize, 7 * moduleSize, 7 * moduleSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((x + 1) * moduleSize, (y + 1) * moduleSize, 5 * moduleSize, 5 * moduleSize);
    ctx.fillStyle = '#1f108e';
    ctx.fillRect((x + 2) * moduleSize, (y + 2) * moduleSize, 3 * moduleSize, 3 * moduleSize);
  };

  drawFinder(0, 0);
  drawFinder(moduleCount - 7, 0);
  drawFinder(0, moduleCount - 7);

  // Data modules
  let seed = Math.abs(hash);
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      // Skip finder patterns
      if ((row < 8 && col < 8) || (row < 8 && col > moduleCount - 9) || (row > moduleCount - 9 && col < 8)) continue;

      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 3 !== 0) {
        ctx.fillStyle = '#1f108e';
        ctx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize);
      }
    }
  }
}

export function ShareModal({ isOpen, onClose, surveyId, surveyTitle }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const shareLink = `${window.location.origin}/survey/${surveyId}`;

  useEffect(() => {
    if (showQR && canvasRef.current) {
      generateQR(canvasRef.current, shareLink);
    }
  }, [showQR, shareLink]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setShowQR(false);
    }
  }, [isOpen]);

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`, '_blank', 'width=600,height=400');
  };

  const shareViaZalo = () => {
    window.open(`https://zalo.me/share?url=${encodeURIComponent(shareLink)}`, '_blank', 'width=600,height=400');
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Mời bạn tham gia khảo sát: ${surveyTitle}`);
    const body = encodeURIComponent(`Xin chào,\n\nTôi muốn mời bạn tham gia khảo sát "${surveyTitle}".\n\nBạn có thể truy cập link sau để bắt đầu:\n${shareLink}\n\nCảm ơn bạn!`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[61] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-300 overflow-hidden">
          {/* Header */}
          <div className="p-6 pb-4 flex items-center justify-between border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center">
                <Link2 size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-text-primary">Chia sẻ khảo sát</h3>
                <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{surveyTitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-container rounded-xl transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Copy Link */}
            <div>
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 block">
                Link khảo sát
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-surface-background border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary font-medium truncate select-all">
                  {shareLink}
                </div>
                <button
                  onClick={copyLink}
                  className={`px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer ${
                    copied
                      ? 'bg-sentiment-positive text-white'
                      : 'bg-primary text-white hover:bg-primary/90 active:scale-95'
                  }`}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Đã sao' : 'Sao chép'}
                </button>
              </div>
            </div>

            {/* Social Share Buttons */}
            <div>
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 block">
                Chia sẻ qua
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={shareViaFacebook}
                  className="flex flex-col items-center gap-2 p-4 bg-[#1877F2]/5 border border-[#1877F2]/20 rounded-xl hover:bg-[#1877F2]/10 hover:border-[#1877F2]/40 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#1877F2]">Facebook</span>
                </button>

                <button
                  onClick={shareViaZalo}
                  className="flex flex-col items-center gap-2 p-4 bg-[#0068FF]/5 border border-[#0068FF]/20 rounded-xl hover:bg-[#0068FF]/10 hover:border-[#0068FF]/40 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-[#0068FF] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <span className="text-white font-bold text-xs">Zalo</span>
                  </div>
                  <span className="text-xs font-bold text-[#0068FF]">Zalo</span>
                </button>

                <button
                  onClick={shareViaEmail}
                  className="flex flex-col items-center gap-2 p-4 bg-surface-container-low border border-border-subtle rounded-xl hover:bg-surface-container hover:border-primary/30 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-text-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Mail size={20} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-text-secondary">Email</span>
                </button>
              </div>
            </div>

            {/* QR Code Toggle */}
            <div>
              <button
                onClick={() => setShowQR(!showQR)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-surface-background border border-border-subtle rounded-xl text-sm font-bold text-text-secondary hover:text-primary hover:border-primary/30 transition-all cursor-pointer"
              >
                <QrCode size={18} />
                {showQR ? 'Ẩn mã QR' : 'Hiện mã QR để quét'}
              </button>

              {showQR && (
                <div className="mt-4 flex flex-col items-center animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className="p-4 bg-white border-2 border-border-subtle rounded-2xl shadow-sm">
                    <canvas ref={canvasRef} className="w-[200px] h-[200px]" />
                  </div>
                  <p className="text-xs text-text-secondary mt-3 text-center font-medium">
                    Quét mã QR bằng điện thoại để mở khảo sát
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-surface-background border-t border-border-subtle flex items-center gap-2">
            <ExternalLink size={14} className="text-text-secondary" />
            <span className="text-xs text-text-secondary font-medium">
              Bất kỳ ai có link đều có thể làm khảo sát này
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
