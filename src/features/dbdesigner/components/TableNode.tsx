import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Key,
  Link2,
  Plus,
  MoreVertical,
  Trash2,
  Copy,
  Clock,
  ShieldAlert,
  Edit2,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useDBDesignerStore } from '../dbDesignerStore';
import { getTypesForDialect } from '../dialects';
import type { DBTable, DBColumn } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

const TABLE_COLORS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#64748b', // Slate
];

export const TableNode = React.memo(({ id, data, selected }: NodeProps) => {
  const table = data as unknown as DBTable;
  const {
    updateTable,
    deleteTable,
    duplicateTable,
    addColumn,
    updateColumn,
    deleteColumn,
    quickAddTimestamps,
    quickAddSoftDelete,
    dialect,
  } = useDBDesignerStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tableName, setTableName] = useState(table.name || 'table_name');
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');

  const availableTypes = getTypesForDialect(dialect);
  const tableColor = table.color || '#6366f1';

  const commitTableName = () => {
    if (tableName.trim()) {
      updateTable(id, { name: tableName.trim() });
    }
    setIsEditingTitle(false);
  };

  const commitColumnName = (colId: string) => {
    if (editingColName.trim()) {
      updateColumn(id, colId, { name: editingColName.trim() });
    }
    setEditingColId(null);
  };

  return (
    <div
      className={cn(
        'group bg-card text-card-foreground rounded-2xl border border-border shadow-xl min-w-[280px] max-w-sm overflow-hidden select-none transition-all duration-150',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      {/* Table Color Header Bar */}
      <div className="h-2 w-full" style={{ backgroundColor: tableColor }} />

      {/* Table Header */}
      <div className="px-3.5 py-2.5 bg-muted/40 border-b border-border/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 truncate flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1 w-full">
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                onBlur={commitTableName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTableName();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                  e.stopPropagation();
                }}
                autoFocus
                className="w-full h-6 px-1.5 text-xs font-bold rounded border border-primary bg-background outline-none"
              />
              <button onClick={commitTableName}>
                <Check className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 cursor-pointer truncate group/title"
              onDoubleClick={() => setIsEditingTitle(true)}
            >
              <span className="text-xs font-bold text-foreground font-mono truncate">
                {table.name}
              </span>
              <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity" />
            </div>
          )}
        </div>

        {/* Table Options Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
              Table Color
            </div>
            <div className="flex items-center gap-1 px-2 pb-2">
              {TABLE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateTable(id, { color: c })}
                  className="w-4 h-4 rounded-full border border-black/20 hover:scale-125 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => quickAddTimestamps(id)} className="gap-2 text-xs">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span>Add Timestamps</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => quickAddSoftDelete(id)} className="gap-2 text-xs">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Add Soft Delete</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateTable(id)} className="gap-2 text-xs">
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate Table</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => deleteTable(id)} className="gap-2 text-xs text-rose-500">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Table</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Columns List */}
      <div className="divide-y divide-border/40 py-1">
        {table.columns.map((col: DBColumn) => {
          const isColEditing = editingColId === col.id;

          return (
            <div
              key={col.id}
              className="relative px-3.5 py-1.5 flex items-center justify-between text-xs hover:bg-accent/40 transition-colors group/row"
            >
              {/* Exact Column Row Connection Handles for Foreign Keys */}
              <Handle
                type="target"
                position={Position.Left}
                id={`col-${col.id}-left-target`}
                className="!w-2.5 !h-2.5 !bg-primary/90 !border-background hover:!scale-150 transition-transform"
              />
              <Handle
                type="source"
                position={Position.Left}
                id={`col-${col.id}-left-source`}
                className="!w-2.5 !h-2.5 !bg-transparent !border-transparent pointer-events-auto"
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`col-${col.id}-right-source`}
                className="!w-2.5 !h-2.5 !bg-primary/90 !border-background hover:!scale-150 transition-transform"
              />
              <Handle
                type="target"
                position={Position.Right}
                id={`col-${col.id}-right-target`}
                className="!w-2.5 !h-2.5 !bg-transparent !border-transparent pointer-events-auto"
              />

              {/* Start: Column Badges & Name */}
              <div className="flex items-center gap-1.5 truncate pe-2 flex-1">
                {/* Badges */}
                <div className="flex items-center gap-1 shrink-0">
                  {col.isPrimaryKey && (
                    <span
                      title="Primary Key"
                      className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    >
                      <Key className="w-2.5 h-2.5 me-0.5" />
                      PK
                    </span>
                  )}
                  {col.isForeignKey && (
                    <span
                      title="Foreign Key"
                      className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-sky-500/15 text-sky-500 border border-sky-500/30"
                    >
                      <Link2 className="w-2.5 h-2.5 me-0.5" />
                      FK
                    </span>
                  )}
                  {col.isUnique && !col.isPrimaryKey && (
                    <span
                      title="Unique"
                      className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-purple-500/15 text-purple-500 border border-purple-500/30"
                    >
                      UQ
                    </span>
                  )}
                </div>

                {/* Column Name */}
                {isColEditing ? (
                  <div className="flex items-center gap-1 w-full">
                    <input
                      type="text"
                      value={editingColName}
                      onChange={(e) => setEditingColName(e.target.value)}
                      onBlur={() => commitColumnName(col.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitColumnName(col.id);
                        if (e.key === 'Escape') setEditingColId(null);
                        e.stopPropagation();
                      }}
                      autoFocus
                      className="h-5 px-1 text-xs bg-background border border-primary rounded outline-none font-mono w-full"
                    />
                  </div>
                ) : (
                  <span
                    onDoubleClick={() => {
                      setEditingColId(col.id);
                      setEditingColName(col.name);
                    }}
                    className={cn(
                      'font-mono text-xs truncate cursor-pointer hover:underline',
                      col.isPrimaryKey ? 'font-bold text-foreground' : 'text-foreground/90'
                    )}
                  >
                    {col.name}
                  </span>
                )}
              </div>

              {/* End: Column Type Dropdown & Delete Button */}
              <div className="flex items-center gap-1 shrink-0">
                <select
                  value={col.type}
                  onChange={(e) => updateColumn(id, col.id, { type: e.target.value })}
                  className="h-5 px-1 text-[11px] font-mono text-muted-foreground bg-transparent border-0 hover:bg-accent rounded outline-none cursor-pointer text-end"
                >
                  {availableTypes.includes(col.type) ? null : (
                    <option value={col.type}>{col.type}</option>
                  )}
                  {availableTypes.map((t) => (
                    <option key={t} value={t} className="bg-popover text-popover-foreground">
                      {t}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => deleteColumn(id, col.id)}
                  className="opacity-0 group-hover/row:opacity-100 p-0.5 text-muted-foreground hover:text-rose-500 transition-opacity rounded"
                  title="Delete column"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Quick Add Column */}
      <div className="px-3 py-1.5 bg-muted/20 border-t border-border/40 flex items-center justify-between">
        <button
          onClick={() => addColumn(id)}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Column</span>
        </button>

        <span className="text-[10px] text-muted-foreground">
          {table.columns.length} cols
        </span>
      </div>
    </div>
  );
});

TableNode.displayName = 'TableNode';
