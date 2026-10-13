import { findAnnotations, type AnnotationMatch } from "./annotation-syntax";
import { findReferencedAnnotation } from "./annotation-reference";

export const PULSE_PLUGIN_ID = "crisp-pulse";
export const PULSE_MEMO_API_VERSION = 1;
const PULSE_REQUIRED = "记为想法需要 Crisp Pulse 1.20.0 或更高版本";

export interface PulseMemoRef {
  id: string;
  path: string;
}

export interface PulseCaptureResult {
  status: "created" | "existing";
  changed: boolean;
  memo: PulseMemoRef;
}

export interface PulseCaptureRequest {
  apiVersion: number;
  sourceId: string;
  revision: string;
  note: string;
  quote: string;
  sourcePath: string;
  subpath: string | null;
}

export interface PulseMemoApi {
  memoCaptureApiVersion: number;
  captureMemoFromSource(request: PulseCaptureRequest): Promise<PulseCaptureResult>;
  revealMemo(memo: PulseMemoRef): Promise<void>;
}

/** Obsidian 的 App 类型里没有 plugins，这里按实际运行时结构读取。 */
interface PulseHostApp {
  plugins?: { plugins?: Record<string, unknown> };
}

export interface HeadingLike {
  heading: string;
  position: { start: { offset: number } };
}

/** Pulse 已启用且提供第 1 版速记接口时返回它；没装、旧版或已停用都返回 null。 */
export function findPulseMemoApi(app: object): PulseMemoApi | null {
  const pulse = (app as PulseHostApp).plugins?.plugins?.[PULSE_PLUGIN_ID] as
    | (Partial<PulseMemoApi> & { unloaded?: boolean })
    | undefined;
  if (!pulse || pulse.unloaded) return null;
  if (typeof pulse.captureMemoFromSource !== "function" || typeof pulse.revealMemo !== "function") return null;
  if (!Number.isInteger(pulse.memoCaptureApiVersion) || (pulse.memoCaptureApiVersion ?? 0) < PULSE_MEMO_API_VERSION) return null;
  return pulse as PulseMemoApi;
}

/** 两个 FNV-1a 32 位哈希拼成 16 位十六进制；只用于去重，不做安全用途。 */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** 标注没有自带 ID：按笔记路径、原文和它是同一笔记里第几处相同原文来认，不用字符偏移。 */
export function annotationSourceId(
  path: string,
  annotation: AnnotationMatch,
  annotations: AnnotationMatch[],
): string {
  const occurrence = annotations.filter((candidate) => (
    candidate.target === annotation.target && candidate.from < annotation.from
  )).length;
  return `crisp-annotations:${fingerprint(`${path}\u0000${annotation.target}\u0000${occurrence}`)}`;
}

/** 标注所在的最近一个标题；标题前的标注返回 null。 */
export function annotationHeading(headings: HeadingLike[] | null | undefined, offset: number): string | null {
  let found: string | null = null;
  for (const heading of headings ?? []) {
    if (heading.position.start.offset > offset) break;
    found = heading.heading;
  }
  return found;
}

/** 把标注中心里的一条标注记成 Pulse 速记。标注已变化、Pulse 不可用时直接报错，不写任何文件。 */
export async function sendAnnotationToPulse(
  app: object,
  input: { path: string; source: string; reference: AnnotationMatch; headings?: HeadingLike[] | null },
): Promise<PulseCaptureResult> {
  const pulse = findPulseMemoApi(app);
  if (!pulse) throw new Error(PULSE_REQUIRED);
  const annotation = findReferencedAnnotation(input.source, input.reference);
  if (!annotation) throw new Error("标注内容已经变化，请刷新标注中心后重试。");
  return pulse.captureMemoFromSource({
    apiVersion: PULSE_MEMO_API_VERSION,
    sourceId: annotationSourceId(input.path, annotation, findAnnotations(input.source)),
    revision: fingerprint(annotation.spec.note),
    note: annotation.spec.note,
    quote: annotation.target,
    sourcePath: input.path,
    subpath: annotationHeading(input.headings, annotation.from),
  });
}
