import React, { useState, useRef, useCallback } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Slider } from './ui/slider';
import { 
  Crop, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  Check, 
  X, 
  Upload,
  RefreshCw,
  Maximize2
} from 'lucide-react';

/**
 * مكون قص ومعاينة الصور
 * يدعم: القص، التدوير، التكبير/التصغير
 */
export default function ImageCropper({
  open,
  onClose,
  onCropComplete,
  aspectRatio = 1, // نسبة العرض للارتفاع (1 = مربع، 16/9 = عريض)
  title = 'تعديل الصورة',
  circularCrop = false, // قص دائري
  minWidth = 50,
  minHeight = 50,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.9
}) {
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ unit: '%', width: 80, aspect: aspectRatio });
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(false);
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);

  // تحميل الصورة من الجهاز
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result);
      setRotation(0);
      setScale(1);
      setCrop({ unit: '%', width: 80, aspect: aspectRatio });
    };
    reader.readAsDataURL(file);
  };

  // إعادة ضبط الصورة
  const handleReset = () => {
    setRotation(0);
    setScale(1);
    setCrop({ unit: '%', width: 80, aspect: aspectRatio });
  };

  // تدوير الصورة
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // إنشاء الصورة المقصوصة
  const getCroppedImg = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return null;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // حساب أبعاد القص الفعلية
    const cropX = completedCrop.x * scaleX;
    const cropY = completedCrop.y * scaleY;
    const cropWidth = completedCrop.width * scaleX;
    const cropHeight = completedCrop.height * scaleY;

    // تحديد أبعاد الـ canvas النهائية
    let finalWidth = cropWidth;
    let finalHeight = cropHeight;

    // تطبيق الحد الأقصى
    if (finalWidth > maxWidth) {
      finalHeight = (maxWidth / finalWidth) * finalHeight;
      finalWidth = maxWidth;
    }
    if (finalHeight > maxHeight) {
      finalWidth = (maxHeight / finalHeight) * finalWidth;
      finalHeight = maxHeight;
    }

    canvas.width = finalWidth;
    canvas.height = finalHeight;

    // تطبيق التدوير إذا لزم الأمر
    if (rotation !== 0) {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      if (rotation === 90 || rotation === 270) {
        tempCanvas.width = image.naturalHeight;
        tempCanvas.height = image.naturalWidth;
      } else {
        tempCanvas.width = image.naturalWidth;
        tempCanvas.height = image.naturalHeight;
      }

      tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
      tempCtx.rotate((rotation * Math.PI) / 180);
      tempCtx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

      ctx.drawImage(
        tempCanvas,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, finalWidth, finalHeight
      );
    } else {
      ctx.drawImage(
        image,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, finalWidth, finalHeight
      );
    }

    // تطبيق القص الدائري إذا كان مفعلاً
    if (circularCrop) {
      const circularCanvas = document.createElement('canvas');
      const circularCtx = circularCanvas.getContext('2d');
      circularCanvas.width = finalWidth;
      circularCanvas.height = finalHeight;

      circularCtx.beginPath();
      circularCtx.arc(finalWidth / 2, finalHeight / 2, Math.min(finalWidth, finalHeight) / 2, 0, Math.PI * 2);
      circularCtx.closePath();
      circularCtx.clip();
      circularCtx.drawImage(canvas, 0, 0);

      return new Promise((resolve) => {
        circularCanvas.toBlob(
          (blob) => {
            if (blob) {
              const file = new File([blob], 'cropped-image.png', { type: 'image/png' });
              resolve(file);
            } else {
              resolve(null);
            }
          },
          'image/png',
          1
        );
      });
    }

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' });
            resolve(file);
          } else {
            resolve(null);
          }
        },
        'image/jpeg',
        quality
      );
    });
  }, [completedCrop, rotation, maxWidth, maxHeight, quality, circularCrop]);

  // تأكيد القص
  const handleConfirm = async () => {
    if (!completedCrop) {
      alert('يرجى تحديد منطقة القص');
      return;
    }

    setLoading(true);
    try {
      const croppedFile = await getCroppedImg();
      if (croppedFile) {
        onCropComplete(croppedFile);
        handleClose();
      }
    } catch (error) {
      console.error('Error cropping image:', error);
      alert('فشل في قص الصورة');
    } finally {
      setLoading(false);
    }
  };

  // إغلاق النافذة
  const handleClose = () => {
    setImageSrc(null);
    setCrop({ unit: '%', width: 80, aspect: aspectRatio });
    setCompletedCrop(null);
    setRotation(0);
    setScale(1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-800 text-white max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-blue-400" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* زر اختيار الصورة */}
          {!imageSrc && (
            <div 
              className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-300 mb-2">اضغط لاختيار صورة من جهازك</p>
              <p className="text-xs text-gray-500">JPG, PNG, GIF, WebP - حتى 10 ميجابايت</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* منطقة القص */}
          {imageSrc && (
            <>
              <div className="relative bg-gray-900 rounded-lg overflow-hidden max-h-[400px] flex items-center justify-center">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectRatio}
                  circularCrop={circularCrop}
                  minWidth={minWidth}
                  minHeight={minHeight}
                >
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt="للقص"
                    style={{
                      transform: `scale(${scale}) rotate(${rotation}deg)`,
                      maxHeight: '400px',
                      maxWidth: '100%'
                    }}
                    className="transition-transform"
                  />
                </ReactCrop>
              </div>

              {/* أدوات التعديل */}
              <div className="flex flex-wrap items-center justify-center gap-2 p-3 bg-gray-700/50 rounded-lg">
                {/* تدوير */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRotate}
                  className="border-gray-600"
                  title="تدوير 90°"
                >
                  <RotateCw className="h-4 w-4 ml-1" />
                  تدوير
                </Button>

                {/* تكبير */}
                <div className="flex items-center gap-2 px-3">
                  <ZoomOut className="h-4 w-4 text-gray-400" />
                  <Slider
                    value={[scale * 100]}
                    onValueChange={([v]) => setScale(v / 100)}
                    min={50}
                    max={200}
                    step={10}
                    className="w-24"
                  />
                  <ZoomIn className="h-4 w-4 text-gray-400" />
                </div>

                {/* إعادة ضبط */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="border-gray-600"
                  title="إعادة ضبط"
                >
                  <RefreshCw className="h-4 w-4 ml-1" />
                  إعادة ضبط
                </Button>

                {/* اختيار صورة أخرى */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-gray-600"
                >
                  <Upload className="h-4 w-4 ml-1" />
                  صورة أخرى
                </Button>
              </div>

              {/* معلومات */}
              <div className="text-xs text-gray-500 text-center">
                اسحب لتحديد منطقة القص • التدوير: {rotation}° • التكبير: {Math.round(scale * 100)}%
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} className="border-gray-600">
            <X className="h-4 w-4 ml-1" />
            إلغاء
          </Button>
          {imageSrc && (
            <Button 
              onClick={handleConfirm} 
              disabled={loading || !completedCrop}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 ml-1 animate-spin" />
                  جاري المعالجة...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 ml-1" />
                  تأكيد القص
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
