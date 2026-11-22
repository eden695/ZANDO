import React, {useEffect, useState} from 'react';
import {Package} from 'lucide-react';
import {getBlobObjectUrl} from '../services/mediaService';

interface BlobImageProps {
  blobId?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export const BlobImage: React.FC<BlobImageProps> = ({
  blobId,
  alt,
  className = 'w-full h-full object-cover',
  fallbackLabel,
}) => {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (!blobId) {
      setSrc(undefined);
      return;
    }

    getBlobObjectUrl(blobId)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [blobId]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ${className}`}
        aria-label={alt}
      >
        <Package className="w-6 h-6 opacity-70" />
        {fallbackLabel && (
          <span className="mt-1 text-[11px] font-medium px-2 text-center truncate max-w-full">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
