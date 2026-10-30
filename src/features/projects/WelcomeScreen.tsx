import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  Plus,
  Network,
  Clock,
  Trash2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShoppingCart,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useProjectStore } from './projectStore';
import { NewProjectModal } from './NewProjectModal';
import { LanguageSelector } from '@/shared/components/LanguageSelector';
import { ThemeSelector } from '@/shared/components/ThemeSelector';
import {
  createTemplateBlankMindmap,
  createTemplateBrainstorm,
  createTemplateBlogDB,
  createTemplateEcommerceDB,
  createTemplateAuthDB,
} from './templates';
import { db } from '@/shared/db';

export function WelcomeScreen() {
  const { t } = useTranslation();
  const {
    loadProject,
    openFromDisk,
    recentProjects,
    deleteRecentProject,
  } = useProjectStore();

  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  const handleOpenRecent = async (id: string) => {
    try {
      const proj = await db.projects.get(id);
      if (proj) {
        await loadProject(proj, null);
      }
    } catch (err) {
      console.error('Failed to open recent project:', err);
    }
  };

  const handleLoadTemplate = async (templateFn: () => ReturnType<typeof createTemplateBlankMindmap>) => {
    const project = templateFn();
    await loadProject(project, null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col select-none">
      {/* Top Header */}
      <header className="h-16 border-b border-border/80 px-6 sm:px-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Mindgraph Logo" className="w-8 h-8 rounded-lg shadow-sm" />
          <span className="text-lg font-bold tracking-tight text-foreground font-sans">
            Mindgraph
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            v1.0
          </span>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeSelector />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 sm:py-14 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            {t('app.welcome')}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {t('app.welcomeSub')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => setIsNewProjectModalOpen(true)}
              className="gap-2 font-semibold shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>{t('nav.newProject')}</span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => openFromDisk()}
              className="gap-2 font-semibold"
            >
              <FolderOpen className="w-4 h-4" />
              <span>{t('nav.openProject')}</span>
            </Button>
          </div>
        </div>

        {/* Templates Gallery */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>{t('templates.title')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Blank Mind Map */}
            <div
              onClick={() => handleLoadTemplate(createTemplateBlankMindmap)}
              className="group p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/50 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Network className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  {t('templates.blankMindmap')}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('templates.blankMindmapDesc')}
                </p>
              </div>
              <div className="pt-4 flex items-center justify-between text-xs text-primary font-medium">
                <span>{t('nav.mindtree')}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rtl:group-hover:-translate-x-1" />
              </div>
            </div>

            {/* Brainstorming Tree */}
            <div
              onClick={() => handleLoadTemplate(createTemplateBrainstorm)}
              className="group p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/50 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Network className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  {t('templates.brainstorm')}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('templates.brainstormDesc')}
                </p>
              </div>
              <div className="pt-4 flex items-center justify-between text-xs text-primary font-medium">
                <span>{t('nav.mindtree')}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rtl:group-hover:-translate-x-1" />
              </div>
            </div>

            {/* Blog & CMS Schema */}
            <div
              onClick={() => handleLoadTemplate(createTemplateBlogDB)}
              className="group p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/50 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  {t('templates.blogDB')}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('templates.blogDBDesc')}
                </p>
              </div>
              <div className="pt-4 flex items-center justify-between text-xs text-primary font-medium">
                <span>{t('nav.dbschema')} (3 tables)</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rtl:group-hover:-translate-x-1" />
              </div>
            </div>

            {/* E-Commerce Schema */}
            <div
              onClick={() => handleLoadTemplate(createTemplateEcommerceDB)}
              className="group p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/50 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  {t('templates.ecommerceDB')}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('templates.ecommerceDBDesc')}
                </p>
              </div>
              <div className="pt-4 flex items-center justify-between text-xs text-primary font-medium">
                <span>{t('nav.dbschema')} (3 tables)</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rtl:group-hover:-translate-x-1" />
              </div>
            </div>

            {/* Auth & RBAC DB */}
            <div
              onClick={() => handleLoadTemplate(createTemplateAuthDB)}
              className="group p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/50 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                  {t('templates.authDB')}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('templates.authDBDesc')}
                </p>
              </div>
              <div className="pt-4 flex items-center justify-between text-xs text-primary font-medium">
                <span>{t('nav.dbschema')}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rtl:group-hover:-translate-x-1" />
              </div>
            </div>
          </div>
        </section>

        {/* Recent Projects Section */}
        <section className="space-y-4">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span>{t('nav.recentProjects')}</span>
          </h2>

          {recentProjects.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-border text-center text-muted-foreground text-xs">
              {t('nav.noRecentProjects')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentProjects.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleOpenRecent(item.id)}
                  className="group p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all cursor-pointer shadow-xs flex items-center justify-between"
                >
                  <div className="space-y-1 truncate pe-2">
                    <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>{item.documentCount} {t('nav.documents')}</span>
                      <span>•</span>
                      <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRecentProject(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-rose-500"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
      />
    </div>
  );
}
