import { PERMISSION_LABELS, type Permission } from "./rbac";

export const permissionValues = Object.keys(PERMISSION_LABELS) as Permission[];
