export interface CustomerNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: { email?: string; name?: string };
}
