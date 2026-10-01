'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

export function AuthorizedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let objectUrl: string | undefined;
    void fetch(src, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' })
      .then((r) => r.blob())
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);

  if (!url) return <div className={className}>Loading image…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
