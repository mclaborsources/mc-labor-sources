import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { View, Pressable, Text } from 'react-native';
import { signaturePadStyles as styles } from './signaturePadStyles';

export type SignaturePadProps = {
  onSignature: (dataUrl: string) => void;
  onError?: (message: string) => void;
  height?: number;
  showActions?: boolean;
};

export type SignaturePadRef = {
  clear: () => void;
  capture: () => void;
};

function configureContext(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1e293b';
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(function SignaturePad(
  { onSignature, onError, height = 200, showActions = true },
  ref,
) {
  const hostRef = useRef<View>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    configureContext(ctx);
  }, []);

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLDivElement | null;
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'crosshair';
    host.appendChild(canvas);
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext('2d');
    resizeCanvas();

    const pos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = 'touches' in e ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const ctx = ctxRef.current;
      if (!ctx) return;
      drawingRef.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };

    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const ctx = ctxRef.current;
      if (!ctx) return;
      hasInkRef.current = true;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };

    const end = () => {
      drawingRef.current = false;
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(host);

    return () => {
      observer.disconnect();
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
      host.removeChild(canvas);
      canvasRef.current = null;
      ctxRef.current = null;
    };
  }, [resizeCanvas]);

  const clearPad = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    resizeCanvas();
  }, [resizeCanvas]);

  const exportSig = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasInkRef.current) {
      onError?.('Please sign before saving');
      return;
    }
    onSignature(canvas.toDataURL('image/png'));
  }, [onError, onSignature]);

  useImperativeHandle(ref, () => ({
    clear: clearPad,
    capture: exportSig,
  }));

  return (
    <View style={styles.wrap}>
      <View style={[styles.canvas, { height }]}>
        <View ref={hostRef} style={styles.canvasHost} />
      </View>
      {showActions ? (
        <View style={styles.actions}>
          <Pressable style={styles.clearBtn} onPress={clearPad}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={exportSig}>
            <Text style={styles.saveText}>Use signature</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});
