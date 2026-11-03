import type { Project } from './types';

/**
 * Creates a complete deep copy of a project with newly generated IDs for the project
 * and all its documents, appending "(Copy)" to the project name.
 */
export function cloneProjectWithNewIds(project: Project): Project {
  const newProjectId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const clonedDocuments = project.documents.map((doc) => {
    const newDocId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const contentCopy = JSON.parse(JSON.stringify(doc.content));

    return {
      ...doc,
      id: newDocId,
      projectId: newProjectId,
      createdAt: now,
      updatedAt: now,
      content: contentCopy,
    };
  });

  return {
    ...project,
    id: newProjectId,
    name: `${project.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    documents: clonedDocuments,
  };
}
