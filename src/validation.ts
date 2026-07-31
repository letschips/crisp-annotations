export function validateAnnotationTarget(target: string): {
  valid: boolean;
  error?: string;
} {
  if (target !== target.trim()) {
    return {
      valid: false,
      error: "Annotations must use trimmed text.",
    };
  }
  if (/\r?\n|==/.test(target)) {
    return {
      valid: false,
      error: "Annotations must use one line without == markers.",
    };
  }
  return { valid: true };
}
