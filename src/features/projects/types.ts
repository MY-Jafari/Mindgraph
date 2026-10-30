export type DocumentType = 'mindtree' | 'dbschema';

export type SQLDialect = 'postgresql' | 'mysql' | 'mariadb' | 'sqlite' | 'sqlserver' | 'oracle';

export type NamingConvention = 'snake_case' | 'camelCase' | 'PascalCase';

export interface ProjectSettings {
  defaultDialect: SQLDialect;
  namingConvention: NamingConvention;
  autosaveIntervalMs: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// Mind Tree Content Types
export type MindTreeNodeType =
  | 'text'
  | 'link'
  | 'image'
  | 'file'
  | 'note'
  | 'checklist'
  | 'code'
  | 'group'
  | 'label';

export type MindTreeLayoutMode = 'freeform' | 'right' | 'left' | 'both' | 'topdown' | 'radial';

export interface MindTreeNodeData {
  label: string;
  notes?: string;
  tags?: string[];
  shape?: 'rounded' | 'pill' | 'rectangle' | 'circle' | 'cloud' | 'hexagon';
  color?: string;
  fill?: string;
  textColor?: string;
  fontSize?: number;
  icon?: string;
  isCollapsed?: boolean;
  parentId?: string | null;
  [key: string]: unknown;
}

export interface MindTreeNode {
  id: string;
  type: MindTreeNodeType | string;
  position: { x: number; y: number };
  data: MindTreeNodeData;
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
}

export interface MindTreeEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: Record<string, unknown>;
  type?: string;
  animated?: boolean;
}

export interface MindTreeContent {
  nodes: MindTreeNode[];
  edges: MindTreeEdge[];
  viewport: Viewport;
  rootNodeId: string | null;
  layoutMode: MindTreeLayoutMode;
}

// DB Designer Content Types
export interface DBColumn {
  id: string;
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isUnique?: boolean;
  isNullable?: boolean;
  isAutoIncrement?: boolean;
  defaultValue?: string;
  comment?: string;
  checkConstraint?: string;
}

export interface DBIndex {
  id: string;
  name: string;
  columns: string[];
  isUnique?: boolean;
  type?: 'btree' | 'hash' | 'gin' | 'gist' | 'fulltext';
}

export interface DBTable {
  id: string;
  name: string;
  comment?: string;
  color?: string;
  position: { x: number; y: number };
  columns: DBColumn[];
  indexes?: DBIndex[];
  tags?: string[];
  schema?: string;
}

export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-many';
export type FKAction = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
export type CardinalityNotation = 'crows-foot' | 'idef1x' | 'chen' | 'uml';

export interface DBRelationship {
  id: string;
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
  cardinality: Cardinality;
  onUpdate?: FKAction;
  onDelete?: FKAction;
  notation?: CardinalityNotation;
}

export interface DBArea {
  id: string;
  name: string;
  color: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface DBNote {
  id: string;
  content: string;
  position: { x: number; y: number };
  color?: string;
  width?: number;
  height?: number;
}

export interface DBSchemaContent {
  tables: DBTable[];
  relationships: DBRelationship[];
  areas: DBArea[];
  notes: DBNote[];
  dialect: SQLDialect;
  viewport: Viewport;
}

export type DocumentContent = MindTreeContent | DBSchemaContent;

export interface Document {
  id: string;
  projectId: string;
  title: string;
  type: DocumentType;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  content: DocumentContent;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  documents: Document[];
}

export interface RecentProjectMeta {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  documentCount: number;
  documentTypes: DocumentType[];
}
