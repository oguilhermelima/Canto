import { Project } from "ts-morph";
import { resolve } from "node:path";

export interface LoadedProject {
  project: Project;
  packageRoot: string;
}

export function loadProject(packageRoot: string): LoadedProject {
  const root = resolve(packageRoot);
  const project = new Project({
    tsConfigFilePath: resolve(root, "tsconfig.json"),
    skipFileDependencyResolution: false,
    skipAddingFilesFromTsConfig: false,
  });
  return { project, packageRoot: root };
}

export function loadProjectsForWorkspace(workspaceRoot: string, relPackages: string[]): LoadedProject[] {
  return relPackages.map((rel) => loadProject(resolve(workspaceRoot, rel)));
}
