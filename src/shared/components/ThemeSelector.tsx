import { useTranslation } from 'react-i18next';
import { Moon, Sun, Laptop } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '@/shared/components/ui/button';
import { useThemeStore, ACCENT_COLORS, type AccentColor } from '@/shared/stores/themeStore';

export function ThemeSelector() {
  const { t } = useTranslation();
  const { theme, accent, setTheme, setAccent } = useThemeStore();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="iconSm" className="rounded-lg" title={t('theme.toggleTheme')}>
          {theme === 'dark' ? (
            <Moon className="h-4 w-4 text-muted-foreground" />
          ) : theme === 'light' ? (
            <Sun className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Laptop className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('theme.toggleTheme')}</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            <span>{t('theme.light')}</span>
          </div>
          {theme === 'light' && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            <span>{t('theme.dark')}</span>
          </div>
          {theme === 'dark' && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4" />
            <span>{t('theme.system')}</span>
          </div>
          {theme === 'system' && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t('theme.accentColor')}</DropdownMenuLabel>
        <div className="grid grid-cols-6 gap-1 p-2">
          {(Object.keys(ACCENT_COLORS) as AccentColor[]).map((c) => {
            const def = ACCENT_COLORS[c];
            const isSelected = accent === c;
            return (
              <button
                key={c}
                onClick={() => setAccent(c)}
                title={t(def.labelKey)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                  isSelected ? 'ring-2 ring-offset-2 ring-primary' : ''
                }`}
                style={{ backgroundColor: def.badgeHex }}
              >
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
