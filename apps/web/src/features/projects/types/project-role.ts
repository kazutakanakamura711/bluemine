export const ProjectRole = {
  Owner: 'owner',
  Member: 'member',
  Viewer: 'viewer',
} as const;

export type ProjectRole = (typeof ProjectRole)[keyof typeof ProjectRole];

export const ProjectRoleDisplayText = {
  [ProjectRole.Owner]: 'オーナー',
  [ProjectRole.Member]: 'メンバー',
  [ProjectRole.Viewer]: '閲覧者',
} satisfies Record<ProjectRole, string>;
