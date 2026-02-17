import React, { useState, useEffect } from 'react';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { useLanguage } from '../context/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Phone, Mail, MessageCircle, Globe, ExternalLink, Languages } from 'lucide-react';
import axios from 'axios';

const API = API_URL;

export default function SystemContact() {
  const { t, isRTL } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API}/system/invoice-settings`);
      setSettings(res.data || {});
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // تبديل اللغة
  const toggleLanguage = () => {
    const languages = ['ar', 'en', 'ku'];
    const currentIndex = languages.indexOf(language);
    const nextIndex = (currentIndex + 1) % languages.length;
    setLanguage(languages[nextIndex]);
  };

  const getLanguageName = () => {
    switch(language) {
      case 'ar': return 'العربية';
      case 'en': return 'English';
      case 'ku': return 'کوردی';
      default: return 'العربية';
    }
  };

  const handleCall = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const handleWhatsApp = (phone) => {
    // إزالة + من البداية إذا كان موجوداً
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    // إضافة 964 للعراق إذا لم يكن موجوداً
    const fullPhone = cleanPhone.startsWith('964') ? cleanPhone : 
                      cleanPhone.startsWith('0') ? `964${cleanPhone.slice(1)}` : 
                      `964${cleanPhone}`;
    window.open(`https://wa.me/${fullPhone}`, '_blank');
  };

  const handleEmail = (email) => {
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(t('استفسار عن نظام Maestro EGP'))}`;
  };

  const handleWebsite = (url) => {
    if (url) {
      window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const systemName = settings.system_name || 'Maestro EGP';
  const phone1 = settings.system_phone;
  const phone2 = settings.system_phone2;
  const email = settings.system_email;
  const website = settings.system_website;
  const promoText = settings.promo_text || t('نظام إدارة متكامل للمطاعم والكافيهات');
  const ctaText = settings.cta_text || t('للحصول على نسختك تواصل معنا');

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* زر تغيير اللغة */}
      <div className="absolute top-4 left-4 z-10">
        <Button 
          variant="outline" 
          size="sm"
          onClick={toggleLanguage}
          className="bg-white/90 hover:bg-white shadow-md border-amber-300"
        >
          <Languages className="h-4 w-4 ml-1" />
          {getLanguageName()}
        </Button>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white py-8 px-4 text-center shadow-lg relative">
        {settings.system_logo_url && (
          <img 
            src={settings.system_logo_url?.startsWith('/api') 
              ? `${API}${settings.system_logo_url.replace('/api', '')}` 
              : settings.system_logo_url?.startsWith('/uploads')
                ? `${API}${settings.system_logo_url}`
                : settings.system_logo_url}
            alt={systemName}
            className="w-20 h-20 mx-auto mb-4 rounded-full bg-white p-2 shadow-lg object-contain"
            onError={(e) => e.target.style.display = 'none'}
          />
        )}
        <h1 className="text-3xl font-bold mb-2">{systemName}</h1>
        <p className="text-lg opacity-90">{promoText}</p>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        {/* CTA */}
        <div className="text-center">
          <p className="text-xl font-bold text-gray-800">{ctaText}</p>
        </div>

        {/* Contact Buttons */}
        <div className="space-y-4">
          {/* Phone 1 */}
          {phone1 && (
            <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="flex gap-0">
                  <Button 
                    className="flex-1 h-16 rounded-none bg-green-500 hover:bg-green-600 text-white text-lg font-bold"
                    onClick={() => handleCall(phone1)}
                  >
                    <Phone className="h-6 w-6 ml-2" />
                    {t('اتصال')}
                  </Button>
                  <Button 
                    className="flex-1 h-16 rounded-none bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-bold"
                    onClick={() => handleWhatsApp(phone1)}
                  >
                    <MessageCircle className="h-6 w-6 ml-2" />
                    {t('واتساب')}
                  </Button>
                </div>
                <div className="text-center py-2 bg-gray-50 text-gray-600 font-medium" dir="ltr">
                  {phone1}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phone 2 */}
          {phone2 && (
            <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="flex gap-0">
                  <Button 
                    className="flex-1 h-16 rounded-none bg-blue-500 hover:bg-blue-600 text-white text-lg font-bold"
                    onClick={() => handleCall(phone2)}
                  >
                    <Phone className="h-6 w-6 ml-2" />
                    {t('اتصال')}
                  </Button>
                  <Button 
                    className="flex-1 h-16 rounded-none bg-cyan-500 hover:bg-cyan-600 text-white text-lg font-bold"
                    onClick={() => handleWhatsApp(phone2)}
                  >
                    <MessageCircle className="h-6 w-6 ml-2" />
                    {t('واتساب')}
                  </Button>
                </div>
                <div className="text-center py-2 bg-gray-50 text-gray-600 font-medium" dir="ltr">
                  {phone2}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Email */}
          {email && (
            <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <Button 
                  className="w-full h-16 rounded-none bg-red-500 hover:bg-red-600 text-white text-lg font-bold"
                  onClick={() => handleEmail(email)}
                >
                  <Mail className="h-6 w-6 ml-2" />
                  {t('إرسال بريد إلكتروني')}
                </Button>
                <div className="text-center py-2 bg-gray-50 text-gray-600 font-medium" dir="ltr">
                  {email}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Website */}
          {website && (
            <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <Button 
                  className="w-full h-16 rounded-none bg-purple-500 hover:bg-purple-600 text-white text-lg font-bold"
                  onClick={() => handleWebsite(website)}
                >
                  <Globe className="h-6 w-6 ml-2" />
                  {t('زيارة الموقع')}
                  <ExternalLink className="h-4 w-4 mr-2" />
                </Button>
                <div className="text-center py-2 bg-gray-50 text-gray-600 font-medium" dir="ltr">
                  {website}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-8 text-gray-500 text-sm">
          <p>© {new Date().getFullYear()} {systemName}</p>
          <p className="mt-1">{t('جميع الحقوق محفوظة')}</p>
        </div>
      </div>
    </div>
  );
}
