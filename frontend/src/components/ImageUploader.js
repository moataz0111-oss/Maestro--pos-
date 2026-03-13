import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import { API_URL, BACKEND_URL } from '../utils/api';
import { Upload, X, Image as ImageIcon, Link, Loader2, Minimize2 } from 'lucide-react';

const API = API_URL;

// دالة ضغط الصور
const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        // حساب الأبعاد الجديدة مع الحفاظ على النسبة
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
        
        // إنشاء Canvas للضغط
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // تحويل إلى Blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // إنشاء ملف جديد من الـ Blob
              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              
              resolve({
                file: compressedFile,
                originalSize: file.size,
                compressedSize: blob.size,
                compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(1)
              });
            } else {
              reject(new Error('فشل في ضغط الصورة'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => reject(new Error('فشل في تحميل الصورة'));
    };
    
    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
  });
};

// تنسيق حجم الملف
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

export default function ImageUploader({
  value,
  onChange,
  type = 'product', // product, category, general
  label = 'الصورة',
  placeholder = 'أدخل رابط الصورة أو ارفع صورة من جهازك',
  showPreview = true,
  enableCompression = true, // تفعيل الضغط
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.8,
  className = ''
}) {
  const [uploading, setUploading] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState(null);
  const [useUrl, setUseUrl] = useState(!value || value.startsWith('http'));
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // التحقق من أن الملف صورة
    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار ملف صورة');
      return;
    }

    // التحقق من حجم الملف (أقصى 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 10 ميجابايت');
      return;
    }

    setUploading(true);
    setCompressionInfo(null);
    
    try {
      let fileToUpload = file;
      
      // ضغط الصورة إذا كان مفعلاً
      if (enableCompression && file.type !== 'image/gif') {
        toast.loading('جاري ضغط الصورة...');
        
        const result = await compressImage(file, maxWidth, maxHeight, quality);
        fileToUpload = result.file;
        
        setCompressionInfo({
          original: formatFileSize(result.originalSize),
          compressed: formatFileSize(result.compressedSize),
          ratio: result.compressionRatio
        });
        
        toast.dismiss();
        
        if (parseFloat(result.compressionRatio) > 0) {
          toast.success(`تم ضغط الصورة بنسبة ${result.compressionRatio}%`);
        }
      }
      
      toast.loading('جاري رفع الصورة...');
      
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('type', type);

      const response = await axios.post(`${API}/upload/image`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.dismiss();

      // التحقق من جميع الحقول الممكنة للـ URL
      const imageUrl = response.data.image_url || response.data.url || response.data.file_url;
      if (imageUrl) {
        console.log('Image uploaded successfully:', imageUrl);
        onChange(imageUrl);
        toast.success('تم رفع الصورة بنجاح');
      } else {
        console.error('No image URL in response:', response.data);
        toast.error('لم يتم الحصول على رابط الصورة');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Upload error:', error);
      toast.error(error.response?.data?.detail || 'فشل في رفع الصورة');
      setCompressionInfo(null);
    } finally {
      setUploading(false);
      // إعادة تعيين input الملف
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUrlChange = (e) => {
    onChange(e.target.value);
  };

  const handleClear = () => {
    onChange('');
    setCompressionInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFullImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // إذا كان الرابط نسبي، نضيف له الـ API base URL
    return `${API}${url}`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="text-foreground">{label}</Label>
      
      {/* أزرار التبديل */}
      <div className="flex gap-2 mb-2">
        <Button
          type="button"
          variant={useUrl ? "default" : "outline"}
          size="sm"
          onClick={() => setUseUrl(true)}
          className="flex items-center gap-1"
        >
          <Link className="h-3 w-3" />
          رابط
        </Button>
        <Button
          type="button"
          variant={!useUrl ? "default" : "outline"}
          size="sm"
          onClick={() => setUseUrl(false)}
          className="flex items-center gap-1"
        >
          <Upload className="h-3 w-3" />
          رفع صورة
        </Button>
      </div>

      {useUrl ? (
        /* إدخال رابط */
        <div className="flex gap-2">
          <Input
            type="url"
            value={value || ''}
            onChange={handleUrlChange}
            placeholder={placeholder}
            className="flex-1"
          />
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        /* رفع ملف */
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            id={`image-upload-${type}`}
          />
          
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الرفع...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 ml-2" />
                  اختر صورة من الجهاز
                </>
              )}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Minimize2 className="h-3 w-3" />
            <span>الصور تُضغط تلقائياً لتوفير المساحة وتسريع التحميل</span>
          </div>
          
          <p className="text-xs text-muted-foreground">
            الصيغ المدعومة: JPG, PNG, GIF, WEBP, HEIC, BMP, TIFF (أقصى 10MB)
          </p>
          
          {/* معلومات الضغط */}
          {compressionInfo && (
            <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg text-xs text-green-600">
              <Minimize2 className="h-4 w-4" />
              <span>
                تم الضغط: {compressionInfo.original} ← {compressionInfo.compressed} 
                ({compressionInfo.ratio}% توفير)
              </span>
            </div>
          )}
        </div>
      )}

      {/* معاينة الصورة */}
      {showPreview && value && (
        <div className="mt-3">
          <div className="relative w-24 h-24 rounded-lg border overflow-hidden bg-muted">
            <img
              src={getFullImageUrl(value)}
              alt="معاينة"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="hidden absolute inset-0 items-center justify-center bg-muted">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
