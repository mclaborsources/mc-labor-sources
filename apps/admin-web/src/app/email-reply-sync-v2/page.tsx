'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EmailReplySyncV2Page() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'replies');
    router.replace(`/customer-email-evidence?${params.toString()}`);
  }, [router]);

  return <p className="p-6 text-sm text-slate-600">Opening email reply tools…</p>;
}
