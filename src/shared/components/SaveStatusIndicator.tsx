import { useTranslation } from 'react-i18next';
import { Check, Loader2, AlertCircle, Save } from 'lucide-react';
import { useProjectStore } from '@/features/projects/projectStore';
import { cn } from '@/shared/utils/cn';

export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const errorMessage = useProjectStore((s) => s.errorMessage);
  const saveToDisk = useProjectStore((s) => s.saveToDisk);

  const tooltip = saveStatus === 'error' && errorMessage
    ? `${t('common.saveError')}: ${errorMessage}`
    : t('common.save');

  return (
    <button
      onClick={() => saveToDisk()}
      title={tooltip}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none border',
        saveStatus === 'saved' &&
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
        saveStatus === 'saving' &&
          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 animate-pulse',
        saveStatus === 'unsaved' &&
          'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
        saveStatus === 'error' &&
          'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
      )}
    >
      {saveStatus === 'saved' && (
        <>
          <Check className="w-3.5 h-3.5" />
          <span>{t('common.saved')}</span>
        </>
      )}
      {saveStatus === 'saving' && (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{t('common.saving')}</span>
        </>
      )}
      {saveStatus === 'unsaved' && (
        <>
          <Save className="w-3.5 h-3.5" />
          <span>{t('common.unsaved')}</span>
        </>
      )}
      {saveStatus === 'error' && (
        <>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="max-w-[200px] truncate">{errorMessage || t('common.saveError')}</span>
        </>
      )}
    </button>
  );
}
