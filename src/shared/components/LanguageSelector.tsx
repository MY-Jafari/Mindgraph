import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '@/shared/components/ui/button';
import { supportedLanguages } from '@/i18n/config';

export function LanguageSelector() {
  const { i18n } = useTranslation();

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
  };

  const currentLang = supportedLanguages.find((l) => l.code === i18n.language) || supportedLanguages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs font-semibold">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span>{currentLang.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {supportedLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="flex items-center justify-between text-xs cursor-pointer"
          >
            <span className={lang.code === 'fa' ? 'font-persian' : 'font-sans'}>{lang.label}</span>
            {i18n.language === lang.code && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
