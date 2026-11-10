import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Wand2,
  Sliders,
  FileText,
  ListPlus,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useProjectStore } from '@/features/projects/projectStore';
import { notify } from '@/shared/stores/toastStore';
import {
  formatGuidelinesAsPrompt,
  inferConventions,
} from '@/core/conventions';
import type {
  AIGuidelines,
  AIGuidelinesConventions,
  SQLDialect,
  GuidelinesNameCase,
  GuidelinesTableNaming,
  FKAction,
  DBSchemaContent,
} from '@/features/projects/types';

export function DesignGuidelinesModal() {
  const { t } = useTranslation();
  const { isDesignGuidelinesOpen, closeDesignGuidelines } = useSettingsStore();
  const { activeProject, activeDocumentId, updateAIGuidelines } = useProjectStore();

  const activeDoc = useMemo(() => {
    return activeProject?.documents.find((d) => d.id === activeDocumentId);
  }, [activeProject, activeDocumentId]);

  const [activeTab, setActiveTab] = useState<'brief' | 'conventions' | 'rules'>('brief');
  const [brief, setBrief] = useState('');
  const [conventions, setConventions] = useState<AIGuidelinesConventions>({
    dialect: 'postgresql',
    nameCase: 'snake_case',
    tableNaming: 'plural',
    primaryKey: { name: 'id', type: 'uuid', autoIncrement: false },
    foreignKeyPattern: '{table_singular}_id',
    timestamps: true,
    softDelete: false,
    defaultOnDelete: 'CASCADE',
    defaultOnUpdate: 'CASCADE',
    requireComments: false,
    junctionTableNaming: '{a}_{b}',
    rules: [],
  });
  const [newRuleInput, setNewRuleInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Sync state when dialog opens or activeProject changes
  useEffect(() => {
    if (isDesignGuidelinesOpen && activeProject) {
      const stored = activeProject.settings?.aiGuidelines;
      setBrief(stored?.brief || '');
      setConventions({
        dialect: stored?.conventions?.dialect || activeProject.settings?.defaultDialect || 'postgresql',
        nameCase: stored?.conventions?.nameCase || activeProject.settings?.namingConvention || 'snake_case',
        tableNaming: stored?.conventions?.tableNaming || 'plural',
        primaryKey: stored?.conventions?.primaryKey || { name: 'id', type: 'uuid', autoIncrement: false },
        foreignKeyPattern: stored?.conventions?.foreignKeyPattern || '{table_singular}_id',
        timestamps: stored?.conventions?.timestamps !== undefined ? stored.conventions.timestamps : true,
        softDelete: stored?.conventions?.softDelete !== undefined ? stored.conventions.softDelete : false,
        defaultOnDelete: stored?.conventions?.defaultOnDelete || 'CASCADE',
        defaultOnUpdate: stored?.conventions?.defaultOnUpdate || 'CASCADE',
        requireComments: stored?.conventions?.requireComments !== undefined ? stored.conventions.requireComments : false,
        junctionTableNaming: stored?.conventions?.junctionTableNaming || '{a}_{b}',
        rules: stored?.conventions?.rules || [],
      });
      setCopied(false);
    }
  }, [isDesignGuidelinesOpen, activeProject]);

  if (!isDesignGuidelinesOpen || !activeProject) return null;

  const currentPayload: AIGuidelines = {
    brief: brief.trim() || undefined,
    conventions: {
      ...conventions,
      rules: conventions.rules && conventions.rules.length > 0 ? conventions.rules : undefined,
    },
  };

  const handleSave = () => {
    updateAIGuidelines(currentPayload);
    closeDesignGuidelines();
  };

  const handleReset = () => {
    setBrief('');
    setConventions({
      dialect: activeProject.settings?.defaultDialect || 'postgresql',
      nameCase: activeProject.settings?.namingConvention || 'snake_case',
      tableNaming: 'plural',
      primaryKey: { name: 'id', type: 'uuid', autoIncrement: false },
      foreignKeyPattern: '{table_singular}_id',
      timestamps: true,
      softDelete: false,
      defaultOnDelete: 'CASCADE',
      defaultOnUpdate: 'CASCADE',
      requireComments: false,
      junctionTableNaming: '{a}_{b}',
      rules: [],
    });
  };

  const handleCopyAsPrompt = async () => {
    try {
      const promptText = formatGuidelinesAsPrompt(currentPayload, activeProject.name);
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      notify({ kind: 'info', messageKey: 'guidelines.promptCopied' });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleInferFromSchema = () => {
    if (!activeDoc || activeDoc.type !== 'dbschema') {
      alert('Open a Database Schema document to infer conventions.');
      return;
    }
    const content = activeDoc.content as DBSchemaContent;
    const inferred = inferConventions(content);
    setConventions((prev) => ({
      ...prev,
      ...inferred.conventions,
    }));
    notify({ kind: 'info', messageKey: 'guidelines.inferSuccess' });
  };

  const handleAddRule = () => {
    const trimmed = newRuleInput.trim();
    if (!trimmed) return;
    const currentRules = conventions.rules || [];
    if (currentRules.length >= 50) return;
    setConventions((prev) => ({
      ...prev,
      rules: [...(prev.rules || []), trimmed],
    }));
    setNewRuleInput('');
  };

  const handleRemoveRule = (index: number) => {
    setConventions((prev) => ({
      ...prev,
      rules: (prev.rules || []).filter((_, i) => i !== index),
    }));
  };

  return (
    <Dialog open={isDesignGuidelinesOpen} onOpenChange={(open) => !open && closeDesignGuidelines()}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground p-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <DialogTitle className="text-lg font-bold">
              {t('guidelines.title', 'AI Database Design Guidelines')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground text-start">
            {t(
              'guidelines.description',
              'Configure domain constraints and conventions for AI agents designing schemas.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg border border-border/60 my-2 shrink-0">
          <button
            onClick={() => setActiveTab('brief')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'brief'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('guidelines.tabBrief', 'Domain Brief')}</span>
          </button>
          <button
            onClick={() => setActiveTab('conventions')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'conventions'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('guidelines.tabConventions', 'Conventions')}</span>
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'rules'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListPlus className="w-3.5 h-3.5" />
            <span>{t('guidelines.tabRules', 'Custom Rules')}</span>
            {(conventions.rules?.length || 0) > 0 && (
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.2 rounded-full font-semibold">
                {conventions.rules?.length}
              </span>
            )}
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto py-2 space-y-4 pr-1 text-xs">
          {/* TAB 1: BRIEF */}
          {activeTab === 'brief' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground">
                  {t('guidelines.tabBrief', 'Domain Brief & Architecture Context')}
                </label>
                <span
                  className={`text-[10px] ${
                    brief.length > 20000 ? 'text-destructive font-bold' : 'text-muted-foreground'
                  }`}
                >
                  {t('guidelines.charCount', { count: brief.length, max: '20,000' })}
                </span>
              </div>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value.slice(0, 20000))}
                placeholder={t(
                  'guidelines.briefPlaceholder',
                  'Describe business context, domain entities, constraints, performance considerations, and things to avoid (Markdown supported)...'
                )}
                rows={12}
                className="w-full text-xs p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono leading-relaxed resize-none"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tip: Agents read this markdown brief before generating tables and columns. Include specific business constraints like &quot;all prices in cents&quot; or &quot;users are identified by email&quot;.
              </p>
            </div>
          )}

          {/* TAB 2: CONVENTIONS */}
          {activeTab === 'conventions' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Dialect */}
                <div className="space-y-1">
                  <label className="font-medium text-foreground">
                    {t('guidelines.dialect', 'Target SQL Dialect')}
                  </label>
                  <select
                    value={conventions.dialect || 'postgresql'}
                    onChange={(e) =>
                      setConventions((prev) => ({ ...prev, dialect: e.target.value as SQLDialect }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:ring-2 focus:ring-primary"
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="mariadb">MariaDB</option>
                    <option value="sqlite">SQLite</option>
                    <option value="sqlserver">SQL Server</option>
                    <option value="oracle">Oracle</option>
                  </select>
                </div>

                {/* Naming Case */}
                <div className="space-y-1">
                  <label className="font-medium text-foreground">
                    {t('guidelines.nameCase', 'Identifier Naming Case')}
                  </label>
                  <select
                    value={conventions.nameCase || 'snake_case'}
                    onChange={(e) =>
                      setConventions((prev) => ({
                        ...prev,
                        nameCase: e.target.value as GuidelinesNameCase,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:ring-2 focus:ring-primary"
                  >
                    <option value="snake_case">snake_case (e.g. order_items)</option>
                    <option value="camelCase">camelCase (e.g. orderItems)</option>
                    <option value="PascalCase">PascalCase (e.g. OrderItems)</option>
                    <option value="kebab-case">kebab-case (e.g. order-items)</option>
                  </select>
                </div>

                {/* Table Naming (Plural vs Singular) */}
                <div className="space-y-1">
                  <label className="font-medium text-foreground">
                    {t('guidelines.tableNaming', 'Table Naming')}
                  </label>
                  <select
                    value={conventions.tableNaming || 'plural'}
                    onChange={(e) =>
                      setConventions((prev) => ({
                        ...prev,
                        tableNaming: e.target.value as GuidelinesTableNaming,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:ring-2 focus:ring-primary"
                  >
                    <option value="plural">{t('guidelines.plural', 'Plural (e.g. users, orders)')}</option>
                    <option value="singular">{t('guidelines.singular', 'Singular (e.g. user, order)')}</option>
                  </select>
                </div>

                {/* Foreign Key Pattern */}
                <div className="space-y-1">
                  <label className="font-medium text-foreground">
                    {t('guidelines.foreignKeyPattern', 'Foreign Key Pattern')}
                  </label>
                  <input
                    type="text"
                    value={conventions.foreignKeyPattern || '{table_singular}_id'}
                    onChange={(e) =>
                      setConventions((prev) => ({ ...prev, foreignKeyPattern: e.target.value }))
                    }
                    placeholder="{table_singular}_id"
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
              </div>

              {/* Primary Key Settings */}
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                <span className="font-semibold text-foreground block">
                  {t('guidelines.primaryKey', 'Primary Key Convention')}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-0.5">
                      {t('guidelines.pkName', 'PK Column Name')}
                    </label>
                    <input
                      type="text"
                      value={conventions.primaryKey?.name || 'id'}
                      onChange={(e) =>
                        setConventions((prev) => ({
                          ...prev,
                          primaryKey: {
                            name: e.target.value,
                            type: prev.primaryKey?.type || 'uuid',
                            autoIncrement: prev.primaryKey?.autoIncrement,
                          },
                        }))
                      }
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-0.5">
                      {t('guidelines.pkType', 'PK Column Type')}
                    </label>
                    <input
                      type="text"
                      value={conventions.primaryKey?.type || 'uuid'}
                      onChange={(e) =>
                        setConventions((prev) => ({
                          ...prev,
                          primaryKey: {
                            name: prev.primaryKey?.name || 'id',
                            type: e.target.value,
                            autoIncrement: prev.primaryKey?.autoIncrement,
                          },
                        }))
                      }
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="pk-autoinc"
                      checked={Boolean(conventions.primaryKey?.autoIncrement)}
                      onChange={(e) =>
                        setConventions((prev) => ({
                          ...prev,
                          primaryKey: {
                            name: prev.primaryKey?.name || 'id',
                            type: prev.primaryKey?.type || 'uuid',
                            autoIncrement: e.target.checked,
                          },
                        }))
                      }
                      className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                    />
                    <label htmlFor="pk-autoinc" className="text-xs text-foreground cursor-pointer">
                      {t('guidelines.pkAutoIncrement', 'Auto-increment')}
                    </label>
                  </div>
                </div>
              </div>

              {/* Toggles (Timestamps, Soft Delete, Comments) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(conventions.timestamps)}
                    onChange={(e) =>
                      setConventions((prev) => ({ ...prev, timestamps: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                  />
                  <span className="text-xs font-medium text-foreground">
                    {t('guidelines.timestamps', 'Audit Timestamps')}
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(conventions.softDelete)}
                    onChange={(e) =>
                      setConventions((prev) => ({ ...prev, softDelete: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                  />
                  <span className="text-xs font-medium text-foreground">
                    {t('guidelines.softDelete', 'Soft Delete')}
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(conventions.requireComments)}
                    onChange={(e) =>
                      setConventions((prev) => ({ ...prev, requireComments: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                  />
                  <span className="text-xs font-medium text-foreground">
                    {t('guidelines.requireComments', 'Require Comments')}
                  </span>
                </label>
              </div>

              {/* FK Default Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-foreground">
                    {t('guidelines.defaultOnDelete', 'Default FK onDelete')}
                  </label>
                  <select
                    value={conventions.defaultOnDelete || 'CASCADE'}
                    onChange={(e) =>
                      setConventions((prev) => ({
                        ...prev,
                        defaultOnDelete: e.target.value as FKAction,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:ring-2 focus:ring-primary"
                  >
                    <option value="CASCADE">CASCADE</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="SET NULL">SET NULL</option>
                    <option value="SET DEFAULT">SET DEFAULT</option>
                    <option value="NO ACTION">NO ACTION</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-foreground">
                    {t('guidelines.defaultOnUpdate', 'Default FK onUpdate')}
                  </label>
                  <select
                    value={conventions.defaultOnUpdate || 'CASCADE'}
                    onChange={(e) =>
                      setConventions((prev) => ({
                        ...prev,
                        defaultOnUpdate: e.target.value as FKAction,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:ring-2 focus:ring-primary"
                  >
                    <option value="CASCADE">CASCADE</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="SET NULL">SET NULL</option>
                    <option value="SET DEFAULT">SET DEFAULT</option>
                    <option value="NO ACTION">NO ACTION</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
                  placeholder={t(
                    'guidelines.rulePlaceholder',
                    'Add a specific rule (e.g. all monetary columns must use decimal(14,2))...'
                  )}
                  className="flex-1 px-3 py-1.5 rounded-md border border-border bg-background text-xs focus:ring-2 focus:ring-primary"
                />
                <Button size="sm" variant="outline" onClick={handleAddRule} className="text-xs shrink-0">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>{t('guidelines.addRule', 'Add Rule')}</span>
                </Button>
              </div>

              {(!conventions.rules || conventions.rules.length === 0) ? (
                <div className="p-6 text-center text-muted-foreground border border-dashed border-border rounded-lg text-xs">
                  {t('guidelines.noRules', 'No custom rules added yet.')}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {conventions.rules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-muted/20 text-xs"
                    >
                      <span className="flex-1 text-foreground">{rule}</span>
                      <button
                        onClick={() => handleRemoveRule(idx)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        title={t('guidelines.removeRule', 'Remove Rule')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer & Actions */}
        <DialogFooter className="pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            {activeDoc?.type === 'dbschema' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInferFromSchema}
                title={t('guidelines.inferTooltip', 'Analyze existing tables and columns to populate conventions automatically')}
                className="text-xs h-8 gap-1.5"
              >
                <Wand2 className="w-3.5 h-3.5 text-primary" />
                <span>{t('guidelines.inferButton', 'Infer from Schema')}</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('guidelines.resetButton', 'Reset')}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAsPrompt}
              className="text-xs h-8 gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{t('guidelines.copyPrompt', 'Copy as AI Prompt')}</span>
            </Button>

            <Button size="sm" onClick={handleSave} className="text-xs h-8">
              <span>{t('guidelines.save', 'Save Guidelines')}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
