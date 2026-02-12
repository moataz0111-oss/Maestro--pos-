import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';

const languages = [
  { code: 'ar', name: 'العربية', flag: '🇮🇶' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ku', name: 'کوردی', flag: '🏳️' },
];

const LanguageSwitcher = ({ variant = 'default', size = 'sm' }) => {
  const { language, setLanguage } = useLanguage();
  
  const currentLang = languages.find(l => l.code === language) || languages[0];
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant === 'ghost' ? 'ghost' : 'outline'} 
          size={size}
          className="gap-2"
          data-testid="language-switcher"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{currentLang.flag} {currentLang.name}</span>
          <span className="sm:hidden">{currentLang.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className="flex items-center justify-between cursor-pointer"
            data-testid={`lang-${lang.code}`}
          >
            <span className="flex items-center gap-2">
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </span>
            {language === lang.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
