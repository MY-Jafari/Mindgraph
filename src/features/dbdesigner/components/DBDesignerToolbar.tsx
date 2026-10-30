import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Layers,
  StickyNote,
  Undo2,
  Redo2,
  Grid,
  Database,
  Sparkles,
  GitBranch,
  Download,
  Upload,
  ShieldAlert,
  History,
  GitMerge,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useDBDesignerStore } from '../dbDesignerStore';
import { validateSchema } from '../services/linter';
import { createJunctionTable } from '../services/m2mHelper';
import type { SQLDialect, CardinalityNotation } from '../../projects/types';

interface DBDesignerToolbarProps {
  onOpenExport: () => void;
  onOpenImport: () => void;
  onOpenLinter: () => void;
  onOpenDiff: () => void;
}

export function DBDesignerToolbar({
  onOpenExport,
  onOpenImport,
  onOpenLinter,
  onOpenDiff,
}: DBDesignerToolbarProps) {
  const { t } = useTranslation();
  const {
    tables,
    relationships,
    addTable,
    addArea,
    addNote,
    undo,
    redo,
    past,
    future,
    dialect,
    setDialect,
    notation,
    setNotation,
    autoLayout,
    isSnapToGrid,
    setSnapToGrid,
    recordHistory,
    syncToProject,
  } = useDBDesignerStore();

  const DIALECT_OPTIONS: SQLDialect[] = [
    'postgresql',
    'mysql',
    'mariadb',
    'sqlite',
    'sqlserver',
    'oracle',
  ];

  const NOTATION_OPTIONS: Array<{ id: CardinalityNotation; label: string }> = [
    { id: 'crows-foot', label: "Crow's Foot" },
    { id: 'uml', label: 'UML Notation' },
    { id: 'idef1x', label: 'IDEF1X' },
    { id: 'chen', label: 'Chen-lite' },
  ];

  const issues = useMemo(() => {
    return validateSchema(tables, relationships, dialect, 'snake_case');
  }, [tables, relationships, dialect]);

  const errorCount = issues.filter((i) => i.severity === 'error').length;

  const handleM2MHelper = () => {
    if (tables.length < 2) {
      alert('You need at least 2 tables to generate a Many-to-Many junction table.');
      return;
    }
    const tblA = tables[0];
    const tblB = tables[1];
    recordHistory();
    const { junctionTable, relationships: newRels } = createJunctionTable(tblA, tblB);
    useDBDesignerStore.setState({
      tables: [...tables, junctionTable],
      relationships: [...relationships, ...newRels],
    });
    syncToProject();
  };

  return (
    <div className="absolute bottom-6 start-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl bg-card/90 backdrop-blur-md border border-border shadow-xl select-none">
      {/* Primary Actions: Add Table */}
      <Button
        size="sm"
        onClick={() => addTable()}
        className="h-8 gap-1.5 px-3 text-xs font-semibold shadow-xs"
        title="Create new database table"
      >
        <Plus className="w-4 h-4" />
        <span>Add Table</span>
      </Button>

      {/* Add Area */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => addArea()}
        className="h-8 gap-1.5 px-2 text-xs text-foreground hover:bg-accent"
        title="Add table grouping area"
      >
        <Layers className="w-3.5 h-3.5 text-primary" />
        <span className="hidden sm:inline">Area</span>
      </Button>

      {/* Add Note */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => addNote()}
        className="h-8 gap-1.5 px-2 text-xs text-foreground hover:bg-accent"
        title="Add personal annotation note"
      >
        <StickyNote className="w-3.5 h-3.5 text-amber-500" />
        <span className="hidden sm:inline">Note</span>
      </Button>

      {/* Many-to-Many Junction Helper */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleM2MHelper}
        className="h-8 gap-1.5 px-2 text-xs text-foreground hover:bg-accent"
        title="Many-to-Many Helper (Create Junction Table)"
      >
        <GitMerge className="w-3.5 h-3.5 text-purple-500" />
        <span className="hidden md:inline">M:N Junction</span>
      </Button>

      <div className="h-4 w-px bg-border mx-0.5" />

      {/* Undo / Redo */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={undo}
        disabled={past.length === 0}
        title={`${t('common.undo')} (Ctrl+Z)`}
        className="h-8 w-8 text-muted-foreground disabled:opacity-30"
      >
        <Undo2 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={redo}
        disabled={future.length === 0}
        title={`${t('common.redo')} (Ctrl+Y)`}
        className="h-8 w-8 text-muted-foreground disabled:opacity-30"
      >
        <Redo2 className="w-4 h-4" />
      </Button>

      <div className="h-4 w-px bg-border mx-0.5" />

      {/* Dialect Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs font-medium">
            <Database className="w-3.5 h-3.5 text-emerald-500" />
            <span className="uppercase">{dialect}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-40">
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
            SQL Dialect
          </DropdownMenuLabel>
          {DIALECT_OPTIONS.map((d) => (
            <DropdownMenuItem
              key={d}
              onClick={() => setDialect(d)}
              className="text-xs uppercase cursor-pointer"
            >
              <span>{d}</span>
              {dialect === d && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Notation Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
            <GitBranch className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden lg:inline">{notation}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-40">
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
            Cardinality Notation
          </DropdownMenuLabel>
          {NOTATION_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.id}
              onClick={() => setNotation(opt.id)}
              className="text-xs cursor-pointer"
            >
              <span>{opt.label}</span>
              {notation === opt.id && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Auto-Layout (Dagre ER) */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => autoLayout('LR')}
        title="Auto-arrange ER Diagram"
        className="h-8 w-8 text-primary hover:bg-primary/10"
      >
        <Sparkles className="w-4 h-4" />
      </Button>

      {/* Snap to grid */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => setSnapToGrid(!isSnapToGrid)}
        title={isSnapToGrid ? 'Snap to grid: On' : 'Snap to grid: Off'}
        className={`h-8 w-8 ${isSnapToGrid ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
      >
        <Grid className="w-4 h-4" />
      </Button>

      <div className="h-4 w-px bg-border mx-0.5" />

      {/* Advanced Tools: Import, Export, Diff, Linter */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={onOpenImport}
        title="Import Schema (SQL/DBML/Text)"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <Upload className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="iconSm"
        onClick={onOpenExport}
        title="Export DDL, Mermaid, ORM, Seed"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <Download className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="iconSm"
        onClick={onOpenDiff}
        title="Schema Snapshots & Diff"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <History className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenLinter}
        title="Schema Linter"
        className={`h-8 px-2 gap-1 text-xs ${
          errorCount > 0 ? 'text-rose-500 font-bold bg-rose-500/10' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        {issues.length > 0 && <span>{issues.length}</span>}
      </Button>
    </div>
  );
}
