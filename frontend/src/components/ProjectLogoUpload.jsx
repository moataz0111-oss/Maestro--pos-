import React, { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from './ui/button';
import { BACKEND_URL } from '../utils/api';

export const resolveImageUrl = (url) => {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const ACCEPT = 'image/*,.heic,.heif,.svg,.bmp,.tif,.tiff,.avif,.webp,.gif,.jfif,.ico';

export const ProjectLogoUpload = ({ preview, onSelect, onClear }) => {
  const inputRef = useRef(null);
  return (
    <div className="flex items-center gap-3" data-testid="project-logo-upload">
      <div className="h-16 w-16 rounded-full border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
        {preview ? (
          <img src={resolveImageUrl(preview)} alt="" className="h-full w-full object-cover" data-testid="project-logo-preview" />
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} data-testid="project-logo-choose-btn">
            {preview ? 'تغيير الصورة' : 'رفع صورة'}
          </Button>
          {preview && onClear && (
            <Button type="button" size="sm" variant="ghost" onClick={onClear} data-testid="project-logo-clear-btn">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">يدعم كل الصيغ: JPG, PNG, WEBP, HEIC, GIF, SVG, BMP...</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="project-logo-file-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelect(f); e.target.value = ''; }}
      />
    </div>
  );
};
