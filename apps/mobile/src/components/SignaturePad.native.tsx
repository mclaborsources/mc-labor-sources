import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { View, Pressable, Text, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { signaturePadStyles as styles } from './signaturePadStyles';

const SIGNATURE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; touch-action: none; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #fff;
      -webkit-user-select: none;
      user-select: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
  </style>
</head>
<body>
  <canvas id="sig"></canvas>
  <script>
    const canvas = document.getElementById('sig');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasInk = false;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
    }

    function coords(e) {
      const rect = canvas.getBoundingClientRect();
      const source = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      return {
        x: source.clientX - rect.left,
        y: source.clientY - rect.top,
      };
    }

    function start(e) {
      if (e.cancelable) e.preventDefault();
      drawing = true;
      const p = coords(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }

    function move(e) {
      if (!drawing) return;
      if (e.cancelable) e.preventDefault();
      hasInk = true;
      const p = coords(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    function end(e) {
      if (e && e.cancelable) e.preventDefault();
      drawing = false;
    }

    function clearPad() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInk = false;
      resize();
    }

    function exportSig() {
      if (!hasInk) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'Please sign before saving' }));
        return;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signature', dataUrl: canvas.toDataURL('image/png') }));
    }

    window.clearPad = clearPad;
    window.exportSig = exportSig;
    window.refreshPad = resize;

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });

    window.addEventListener('resize', resize);
    setTimeout(resize, 0);
    setTimeout(resize, 250);
  </script>
</body>
</html>
`;

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

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(function SignaturePad(
  { onSignature, onError, height = 200, showActions = true },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const pendingActionRef = useRef<'clear' | 'export' | null>(null);

  const runInWebView = useCallback((expression: string) => {
    webRef.current?.injectJavaScript(`(function(){ try { ${expression}; } catch (e) {} })(); true;`);
  }, []);

  const flushPendingAction = useCallback(() => {
    const action = pendingActionRef.current;
    if (!action) return;
    pendingActionRef.current = null;
    if (action === 'clear') {
      runInWebView('window.clearPad && window.clearPad()');
    } else {
      runInWebView('window.exportSig && window.exportSig()');
    }
  }, [runInWebView]);

  const postAction = useCallback(
    (action: 'clear' | 'export') => {
      if (!ready) {
        pendingActionRef.current = action;
        return;
      }
      if (action === 'clear') {
        runInWebView('window.clearPad && window.clearPad()');
      } else {
        runInWebView('window.exportSig && window.exportSig()');
      }
    },
    [ready, runInWebView],
  );

  useImperativeHandle(ref, () => ({
    clear: () => postAction('clear'),
    capture: () => postAction('export'),
  }));

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type: string;
          dataUrl?: string;
          message?: string;
        };
        if (msg.type === 'signature' && msg.dataUrl) {
          onSignature(msg.dataUrl);
        } else if (msg.type === 'error' && msg.message) {
          onError?.(msg.message);
        }
      } catch {
        onError?.('Could not read signature');
      }
    },
    [onError, onSignature],
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.canvas, { height }]} collapsable={false}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html: SIGNATURE_HTML, baseUrl: 'https://localhost' }}
          onMessage={onMessage}
          onLoadEnd={() => {
            setReady(true);
            runInWebView('window.refreshPad && window.refreshPad()');
            flushPendingAction();
          }}
          scrollEnabled={false}
          bounces={false}
          nestedScrollEnabled={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          androidLayerType={Platform.OS === 'android' ? 'software' : undefined}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          automaticallyAdjustContentInsets={false}
          setSupportMultipleWindows={false}
          cacheEnabled={false}
        />
      </View>
      {showActions ? (
        <View style={styles.actions}>
          <Pressable style={styles.clearBtn} onPress={() => postAction('clear')}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={() => postAction('export')}>
            <Text style={styles.saveText}>Use signature</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});
