export function requireNewsletterEditorAccess(): Promise<{ allowed: boolean }> {
  return Promise.resolve({ allowed: true });
}
