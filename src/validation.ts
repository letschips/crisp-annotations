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
  if (target.includes("==")) {
    return {
      valid: false,
      error: "Annotations must not contain == markers.",
    };
  }
  return { valid: true };
}

/**
 * 裁剪选区首尾空白并返回偏移量，供编辑器按裁剪后的精确范围替换，
 * 保留原文中选区之外的空白字符。
 */
export function normalizeAnnotationTarget(raw: string): {
  target: string;
  leadingTrim: number;
  trailingTrim: number;
} {
  return {
    target: raw.trim(),
    leadingTrim: raw.length - raw.trimStart().length,
    trailingTrim: raw.length - raw.trimEnd().length,
  };
}
