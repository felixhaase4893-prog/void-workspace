import { Check, Languages } from 'lucide-react';

import { useLanguage } from '../../i18n/I18nBoundary';
import { LANGUAGES, type Language } from '../../i18n/languages';
import { t } from '../../i18n/translate';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../state/preferencesContext';
import { SettingsSection } from './SettingsSection';

/** Picks the app language. Each choice is shown in its own language, so it can be found in any of them. */
export function LanguageSection() {
  const { updatePreferences } = usePreferences();
  const active = useLanguage();
  const choose = (language: Language) => updatePreferences((current) => ({ ...current, language }));

  return (
    <SettingsSection title={t('Language')} description={t('The language VOID uses for menus, labels and messages. Your own content is not translated.')}>
      <fieldset>
        <legend className="sr-only">{t('App language')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {LANGUAGES.map((language) => {
            const checked = language.code === active;
            return (
              <label
                key={language.code}
                className={cn(
                  'relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-400/60',
                  checked ? 'border-accent-400/60 bg-accent-500/10' : 'border-line hover:border-line-strong hover:bg-raised',
                )}
              >
                <input type="radio" name="app-language" value={language.code} checked={checked} onChange={() => choose(language.code)} className="sr-only" />
                <Languages aria-hidden className={cn('size-4 shrink-0', checked ? 'text-accent-300' : 'text-subtle')} />
                <span className="min-w-0 flex-1" lang={language.locale}>
                  <span className="block text-[13px] font-medium text-fg">{language.nativeName}</span>
                  <span className="block text-xs text-subtle">{language.englishName}</span>
                </span>
                {checked && <Check aria-hidden className="size-4 shrink-0 text-accent-300" />}
              </label>
            );
          })}
        </div>
      </fieldset>
    </SettingsSection>
  );
}
