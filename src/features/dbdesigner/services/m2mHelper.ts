import type { DBTable, DBColumn, DBRelationship } from '@/features/projects/types';

/**
 * Creates a Many-to-Many junction table connecting Table A and Table B.
 */
export function createJunctionTable(
  tableA: DBTable,
  tableB: DBTable
): { junctionTable: DBTable; relationships: DBRelationship[] } {
  const pkA = tableA.columns.find((c) => c.isPrimaryKey) || tableA.columns[0];
  const pkB = tableB.columns.find((c) => c.isPrimaryKey) || tableB.columns[0];

  const junctionName = `${tableA.name}_${tableB.name}`;
  const junctionId = `tbl-junction-${Date.now()}`;

  const colAId = `col-${tableA.name}_id-${Date.now()}`;
  const colBId = `col-${tableB.name}_id-${Date.now() + 1}`;

  const colA: DBColumn = {
    id: colAId,
    name: `${tableA.name.slice(0, -1) || tableA.name}_id`,
    type: pkA.type,
    isPrimaryKey: true,
    isForeignKey: true,
    isNullable: false,
  };

  const colB: DBColumn = {
    id: colBId,
    name: `${tableB.name.slice(0, -1) || tableB.name}_id`,
    type: pkB.type,
    isPrimaryKey: true,
    isForeignKey: true,
    isNullable: false,
  };

  const posX = Math.round((tableA.position.x + tableB.position.x) / 2);
  const posY = Math.round((tableA.position.y + tableB.position.y) / 2) + 120;

  const junctionTable: DBTable = {
    id: junctionId,
    name: junctionName,
    color: '#8b5cf6',
    position: { x: posX, y: posY },
    columns: [colA, colB],
    comment: `Junction table linking ${tableA.name} and ${tableB.name}`,
  };

  const relA: DBRelationship = {
    id: `rel-${junctionId}-${tableA.id}`,
    sourceTableId: junctionId,
    sourceColumnId: colAId,
    targetTableId: tableA.id,
    targetColumnId: pkA.id,
    cardinality: 'one-to-many',
    onDelete: 'CASCADE',
  };

  const relB: DBRelationship = {
    id: `rel-${junctionId}-${tableB.id}`,
    sourceTableId: junctionId,
    sourceColumnId: colBId,
    targetTableId: tableB.id,
    targetColumnId: pkB.id,
    cardinality: 'one-to-many',
    onDelete: 'CASCADE',
  };

  return {
    junctionTable,
    relationships: [relA, relB],
  };
}
