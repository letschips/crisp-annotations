import {
  ANNOTATION_PLACES,
  type AnnotationPlace,
} from "./annotation-syntax";
import type {
  AnnotationLayout,
  ArrowStyle,
  CrispAnnotationsSettings,
} from "./settings";
import { buildCoiledSpiralPath } from "./spiral-geometry";

function applyCssProps(el: HTMLElement, props: Record<string, string>): void {
  if (typeof (el as HTMLElement & { setCssProps?: (p: Record<string, string>) => void }).setCssProps === "function") {
    (el as HTMLElement & { setCssProps: (p: Record<string, string>) => void }).setCssProps(props);
  } else {
    for (const [key, val] of Object.entries(props)) {
      el.style.setProperty(key, val);
    }
  }
}

export type MarginSide = "left" | "right";

interface MarginAvailability {
  left: boolean;
  right: boolean;
}

interface MarginCounts {
  left: number;
  right: number;
}

interface MarginNoteInput {
  id: string;
  desiredY: number;
  height: number;
}

interface MarginNotePosition extends MarginNoteInput {
  y: number;
}

interface ConnectorPoint {
  x: number;
  y: number;
}

interface MarginConnectorInput {
  side: MarginSide;
  style: ArrowStyle;
  curve: number;
  from: ConnectorPoint;
  to: ConnectorPoint;
}

interface MarginLayoutState {
  frame: number | null;
  observer: ResizeObserver | null;
  settleTimer: number | null;
  pending: boolean;
}

interface RenderedMarginNote {
  height: number;
  id: string;
  label: HTMLElement;
  side: MarginSide;
  target: HTMLElement;
  targetY: number;
  width: number;
  wrapper: HTMLElement;
  x: number;
}

const MARGIN_SIZER_CLASS = "crisp-ann-margin-sizer";
const NOTE_GAP = 14;
const EDGE_PADDING = 8;
const CONNECTOR_GAP = 54;
const MIN_CONNECTOR_SPACE = 72;
const ROTATION_ALLOWANCE = 14;
const READING_RAIL_CLEARANCE_GAP = 8;
const SETTLE_DELAY_MS = 120;
const BLOCK_SELECTOR = "p, li, td, th, blockquote";
const SPACE_TOP_CLASS = "crisp-ann-block--space-top";
const SPACE_BOTTOM_CLASS = "crisp-ann-block--space-bottom";

function preferredSide(place: string): MarginSide | null {
  if (place.includes("left")) {
    return "left";
  }
  if (place.includes("right")) {
    return "right";
  }
  return null;
}

function readingRailClearance(
  view: HTMLElement,
  viewRect: DOMRect,
): number {
  const pane = view.closest<HTMLElement>(".workspace-leaf-content");
  const rail = pane?.querySelector<HTMLElement>(".crisp-reading-rail");
  if (!rail || rail.hidden) {
    return 0;
  }
  const railRect = rail.getBoundingClientRect();
  if (
    railRect.width <= 0
    || railRect.right <= viewRect.left
    || railRect.left >= viewRect.right
  ) {
    return 0;
  }
  return Math.max(
    0,
    Math.ceil(viewRect.right - railRect.left + READING_RAIL_CLEARANCE_GAP),
  );
}

export function chooseMarginSide(
  place: string,
  layout: AnnotationLayout,
  availability: MarginAvailability,
  counts: MarginCounts,
  targetRect?: { left: number; width: number },
  sizerRect?: { left: number; width: number },
): MarginSide | null {
  if (layout === "inline") {
    return null;
  }
  if (layout === "left-margin") {
    return availability.left ? "left" : null;
  }
  if (layout === "right-margin") {
    return availability.right ? "right" : null;
  }

  const preferred = preferredSide(place);

  if (layout === "smart-margins" && targetRect && sizerRect && sizerRect.width > 0) {
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const sizerLeft = sizerRect.left;
    const ratio = Math.max(0, Math.min(1, (targetCenterX - sizerLeft) / sizerRect.width));

    // 1. Text near left edge (< 35%) -> Left margin
    if (ratio < 0.35) {
      if (availability.left) return "left";
      if (availability.right) return "right";
      return null;
    }

    // 2. Text near right edge (> 65%) -> Right margin
    if (ratio > 0.65) {
      if (availability.right) return "right";
      if (availability.left) return "left";
      return null;
    }

    // 3. Text in middle section (35% ~ 65%):
    // Force Inline (Above / Below) so connector lines NEVER cross over body text!
    return null;
  }

  if (preferred && availability[preferred]) {
    return preferred;
  }
  if (preferred) {
    const other = preferred === "left" ? "right" : "left";
    return availability[other] ? other : null;
  }
  if (availability.left && availability.right) {
    return counts.left <= counts.right ? "left" : "right";
  }
  if (availability.left) {
    return "left";
  }
  if (availability.right) {
    return "right";
  }
  return null;
}

export function distributeMarginNotes(
  notes: MarginNoteInput[],
  containerHeight: number,
  gap: number,
): MarginNotePosition[] {
  if (notes.length === 0) {
    return [];
  }
  const sorted = [...notes].sort((left, right) => left.desiredY - right.desiredY);
  const positions: MarginNotePosition[] = [];
  let nextY = EDGE_PADDING;
  for (const note of sorted) {
    const maximumY = Math.max(EDGE_PADDING, containerHeight - EDGE_PADDING - note.height);
    const y = Math.min(maximumY, Math.max(nextY, note.desiredY));
    positions.push({ ...note, y });
    nextY = y + note.height + gap;
  }

  for (let index = positions.length - 2; index >= 0; index -= 1) {
    const current = positions[index];
    const next = positions[index + 1];
    current.y = Math.min(current.y, next.y - gap - current.height);
  }

  if (positions[0].y < EDGE_PADDING) {
    positions[0].y = EDGE_PADDING;
    for (let index = 1; index < positions.length; index += 1) {
      const previous = positions[index - 1];
      positions[index].y = Math.max(
        positions[index].y,
        previous.y + previous.height + gap,
      );
    }
  }
  return positions;
}

function format(value: number): string {
  return Number(value.toFixed(1)).toString();
}

function point(value: ConnectorPoint): string {
  return `${format(value.x)} ${format(value.y)}`;
}

export function buildMarginConnectorPath(input: MarginConnectorInput): string {
  const { curve, from, style, to } = input;
  if (style === "straight") {
    return `M${point(from)} L${point(to)}`;
  }

  const distance = Math.abs(to.x - from.x);
  if (style === "spiral") {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return buildCoiledSpiralPath(from, to, {
      amplitude: Math.min(18, Math.max(8, length * 0.042)),
      turns: Math.min(2.8, Math.max(1.4, length / 110)),
    });
  }

  if (style === "wavy") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const unit = { x: dx / length, y: dy / length };
    const normal = { x: -unit.y, y: unit.x };
    const waves = Math.max(2, Math.floor(length / 25));
    const samples = waves * 8;
    const points: ConnectorPoint[] = [];
    for (let i = 0; i <= samples; i += 1) {
      const progress = i / samples;
      const angle = progress * waves * Math.PI * 2;
      const envelope = Math.sin(progress * Math.PI);
      const across = Math.sin(angle) * 5 * envelope;
      const along = progress * length;
      points.push({
        x: from.x + unit.x * along + normal.x * across,
        y: from.y + unit.y * along + normal.y * across,
      });
    }
    let path = `M${point(points[0])}`;
    for (let i = 1; i < points.length - 1; i += 1) {
      const mid = {
        x: (points[i].x + points[i + 1].x) / 2,
        y: (points[i].y + points[i + 1].y) / 2,
      };
      path += ` Q${point(points[i])} ${point(mid)}`;
    }
    path += ` L${point(points[points.length - 1])}`;
    return path;
  }

  if (style === "double-underline") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: -dy / length, y: dx / length };
    const offset = 2.2;
    const line1From = { x: from.x + normal.x * offset, y: from.y + normal.y * offset };
    const line1To = { x: to.x + normal.x * offset, y: to.y + normal.y * offset };
    const line2From = { x: from.x - normal.x * offset, y: from.y - normal.y * offset };
    const line2To = { x: to.x - normal.x * offset, y: to.y - normal.y * offset };
    return `M${point(line1From)} L${point(line1To)} M${point(line2From)} L${point(line2To)}`;
  }

  const bend = style === "custom-curve"
    ? Math.max(-100, Math.min(100, curve)) / 100 * Math.min(90, distance * 0.28)
    : 10;
  const firstX = from.x + (to.x - from.x) * 0.36;
  const secondX = from.x + (to.x - from.x) * 0.72;
  return [
    `M${point(from)}`,
    `C${format(firstX)} ${format(from.y + bend)}`,
    `${format(secondX)} ${format(to.y - bend)}`,
    `${point(to)}`,
  ].join(" ");
}

function buildMarginArrowHead(side: MarginSide, target: ConnectorPoint): string {
  const direction = side === "left" ? -1 : 1;
  return [
    `M${format(target.x + direction * 10)} ${format(target.y - 6)}`,
    `L${point(target)}`,
    `L${format(target.x + direction * 10)} ${format(target.y + 6)}`,
  ].join(" ");
}

function annotationPlace(wrapper: HTMLElement): AnnotationPlace {
  return ANNOTATION_PLACES.find((place) => (
    wrapper.classList.contains(`crisp-ann--${place}`)
  )) ?? "bottom";
}

export function blockSpacingClasses(places: string[]): string[] {
  const classes: string[] = [];
  if (places.some((place) => place.startsWith("top"))) {
    classes.push(SPACE_TOP_CLASS);
  }
  if (places.some((place) => place.startsWith("bottom"))) {
    classes.push(SPACE_BOTTOM_CLASS);
  }
  return classes;
}

export function recalculateBlockSpacing(
  sizer: HTMLElement,
  isInline: (wrapper: HTMLElement) => boolean,
): void {
  for (const block of sizer.querySelectorAll<HTMLElement>(
    `.${SPACE_TOP_CLASS}, .${SPACE_BOTTOM_CLASS}`,
  )) {
    block.classList.remove(SPACE_TOP_CLASS, SPACE_BOTTOM_CLASS);
  }
  const wrappers = Array.from(sizer.querySelectorAll<HTMLElement>(".crisp-ann"));
  const grouped = new Map<HTMLElement, string[]>();
  for (const wrapper of wrappers) {
    const block = wrapper.closest<HTMLElement>(BLOCK_SELECTOR);
    if (!block) {
      continue;
    }
    if (!grouped.has(block)) {
      grouped.set(block, []);
    }
    if (isInline(wrapper)) {
      grouped.get(block)?.push(annotationPlace(wrapper));
    }
  }
  for (const [block, places] of grouped) {
    block.classList.add(...blockSpacingClasses(places));
  }
}

function restoreSizer(sizer: HTMLElement, inline: boolean): void {
  const wrappers = Array.from(sizer.querySelectorAll<HTMLElement>(".crisp-ann"));
  for (const wrapper of wrappers) {
    wrapper.classList.remove("crisp-ann--margin");
    for (const connector of wrapper.querySelectorAll(
      ":scope > .crisp-ann-margin-connectors",
    )) {
      connector.remove();
    }
    const label = wrapper.querySelector<HTMLElement>(":scope > .crisp-ann__label");
    label?.classList.remove(
      "crisp-ann-margin-item",
      "crisp-ann-margin-item--left",
      "crisp-ann-margin-item--right",
    );
    for (const property of [
      "bottom",
      "left",
      "right",
      "top",
      "transform",
      "visibility",
      "width",
    ]) {
      label?.style.removeProperty(property);
    }
  }
  recalculateBlockSpacing(sizer, () => inline);
  sizer.classList.remove(MARGIN_SIZER_CLASS);
}

function makeConnector(
  document: Document,
  note: RenderedMarginNote,
  sizerRect: DOMRect,
  settings: CrispAnnotationsSettings,
): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("crisp-ann-margin-connectors");
  svg.setAttribute("width", "1");
  svg.setAttribute("height", "1");

  const group = document.createElementNS(namespace, "g");
  group.classList.add("crisp-ann-margin-connector");
  if (settings.arrowStrokeStyle === "dashed") {
    group.classList.add("crisp-ann-margin-connector--dashed");
  }

  const wrapperRect = note.wrapper.getBoundingClientRect();
  const wrapperOrigin = {
    x: wrapperRect.left - sizerRect.left,
    y: wrapperRect.top - sizerRect.top,
  };
  const targetRect = note.target.getBoundingClientRect();
  const labelRect = note.label.getBoundingClientRect();
  const target = {
    x: (note.side === "left"
      ? targetRect.left - sizerRect.left - 4
      : targetRect.right - sizerRect.left + 4) - wrapperOrigin.x,
    y: targetRect.top - sizerRect.top + targetRect.height / 2 - wrapperOrigin.y,
  };
  const from = {
    x: (note.side === "left" ? labelRect.right + 8 : labelRect.left - 8)
      - wrapperRect.left,
    y: labelRect.top + labelRect.height / 2 - wrapperRect.top,
  };

  const shaft = document.createElementNS(namespace, "path");
  shaft.classList.add("crisp-ann-margin-connector__shaft");
  shaft.setAttribute("d", buildMarginConnectorPath({
    side: note.side,
    style: settings.arrowStyle,
    curve: settings.arrowCurve,
    from,
    to: target,
  }));
  const head = document.createElementNS(namespace, "path");
  head.classList.add("crisp-ann-margin-connector__head");
  head.setAttribute("d", buildMarginArrowHead(note.side, target));
  group.append(shaft, head);
  svg.append(group);
  return svg;
}

export class MarginLayoutManager {
  private readonly states = new Map<HTMLElement, MarginLayoutState>();
  private refreshAllFrame: number | null = null;
  private disposed = false;

  constructor(private readonly getSettings: () => CrispAnnotationsSettings) {}

  schedule(root: HTMLElement): void {
    if (this.disposed) {
      return;
    }
    const findSizer = (): HTMLElement | null => (
      root.matches(".markdown-preview-sizer")
        ? root
        : root.closest<HTMLElement>(".markdown-preview-sizer")
    );
    const sizer = findSizer();
    if (!sizer) {
      root.ownerDocument.defaultView?.requestAnimationFrame(() => {
        const attachedSizer = findSizer();
        if (attachedSizer) {
          this.ensureState(attachedSizer);
          this.scheduleSizer(attachedSizer);
        }
      });
      return;
    }
    this.ensureState(sizer);
    // Debounce: skip if a layout pass is already pending for this sizer
    if (this.states.get(sizer)?.pending) {
      return;
    }
    this.scheduleSizer(sizer);
  }

  refreshAll(): void {
    if (this.disposed) {
      return;
    }
    const window = this.states.size > 0
      ? this.states.keys().next().value?.ownerDocument?.defaultView
      : null;
    if (!window) {
      this.doRefreshAll();
      return;
    }
    if (this.refreshAllFrame !== null) {
      return;
    }
    this.refreshAllFrame = window.requestAnimationFrame(() => {
      this.refreshAllFrame = null;
      this.doRefreshAll();
    });
  }

  destroy(): void {
    this.disposed = true;
    if (this.refreshAllFrame !== null) {
      cancelAnimationFrame(this.refreshAllFrame);
      this.refreshAllFrame = null;
    }
    for (const [sizer, state] of this.states) {
      this.releaseState(sizer, state);
      restoreSizer(sizer, true);
    }
    this.states.clear();
  }

  private doRefreshAll(): void {
    if (this.disposed) {
      return;
    }
    for (const [sizer, state] of this.states) {
      if (!sizer.isConnected) {
        this.releaseState(sizer, state);
        this.states.delete(sizer);
      } else {
        this.scheduleSizer(sizer);
      }
    }
  }

  private ensureState(sizer: HTMLElement): void {
    if (this.states.has(sizer)) {
      return;
    }
    const view = sizer.closest<HTMLElement>(".markdown-preview-view");
    const ResizeObserverConstructor = sizer.ownerDocument.defaultView?.ResizeObserver;
    const observer = ResizeObserverConstructor
      ? new ResizeObserverConstructor(() => this.scheduleSizer(sizer))
      : null;
    observer?.observe(sizer);
    if (view) {
      observer?.observe(view);
    }
    this.states.set(sizer, {
      frame: null,
      observer,
      settleTimer: null,
      pending: false,
    });
  }

  private scheduleSizer(sizer: HTMLElement): void {
    if (this.disposed) {
      return;
    }
    const state = this.states.get(sizer);
    const window = sizer.ownerDocument.defaultView;
    if (!state || !window || state.frame !== null) {
      return;
    }
    state.pending = true;
    state.frame = window.requestAnimationFrame(() => {
      state.frame = null;
      state.pending = false;
      if (!sizer.isConnected) {
        this.releaseState(sizer, state);
        this.states.delete(sizer);
        return;
      }
      this.layoutSizer(sizer);
    });
  }

  private releaseState(
    sizer: HTMLElement,
    state: MarginLayoutState,
  ): void {
    const window = sizer.ownerDocument.defaultView;
    if (state.frame !== null) {
      window?.cancelAnimationFrame(state.frame);
      state.frame = null;
    }
    if (state.settleTimer !== null) {
      window?.clearTimeout(state.settleTimer);
      state.settleTimer = null;
    }
    state.observer?.disconnect();
    state.observer = null;
  }

  private layoutSizer(sizer: HTMLElement): void {
    const settings = this.getSettings();
    const view = sizer.closest<HTMLElement>(".markdown-preview-view");
    const mobile = sizer.ownerDocument.body.classList.contains("is-mobile");
    restoreSizer(sizer, settings.annotationLayout === "inline" || mobile);
    if (!view || mobile || settings.annotationLayout === "inline") {
      return;
    }

    const sizerRect = sizer.getBoundingClientRect();
    const viewRect = view.getBoundingClientRect();
    const requiredWidth = settings.marginNoteWidth + MIN_CONNECTOR_SPACE;
    const rightRailClearance = readingRailClearance(view, viewRect);
    const availability = {
      left: sizerRect.left - viewRect.left >= requiredWidth,
      right: viewRect.right - sizerRect.right
        >= requiredWidth + rightRailClearance,
    };
    const wrappers = Array.from(sizer.querySelectorAll<HTMLElement>(".crisp-ann"));
    if (wrappers.length === 0) {
      return;
    }

    const counts: MarginCounts = { left: 0, right: 0 };
    const notes: Record<MarginSide, RenderedMarginNote[]> = {
      left: [],
      right: [],
    };
    sizer.classList.add(MARGIN_SIZER_CLASS);
    for (const wrapper of wrappers) {
      const label = wrapper.querySelector<HTMLElement>(":scope > .crisp-ann__label");
      const target = wrapper.querySelector<HTMLElement>(".crisp-ann__target");
      if (!label || !target) {
        continue;
      }
      const side = chooseMarginSide(
        annotationPlace(wrapper),
        settings.annotationLayout,
        availability,
        counts,
        target.getBoundingClientRect(),
        sizerRect,
      );
      if (!side) {
        continue;
      }
      counts[side] += 1;
      wrapper.classList.add("crisp-ann--margin");
      label.classList.add(
        "crisp-ann-margin-item",
        `crisp-ann-margin-item--${side}`,
      );
      applyCssProps(label, {
        right: "auto",
        bottom: "auto",
        left: "0",
        top: "0",
        transform: "rotate(var(--crisp-ann-rotate))",
        visibility: "hidden",
        width: `${settings.marginNoteWidth}px`,
      });

      const targetRect = target.getBoundingClientRect();
      const height = Math.max(
        20,
        label.scrollHeight + ROTATION_ALLOWANCE,
      );
      const x = side === "left"
        ? -settings.marginNoteWidth - CONNECTOR_GAP
        : sizerRect.width + CONNECTOR_GAP;
      notes[side].push({
        height,
        id: label.id,
        label,
        side,
        target,
        targetY: targetRect.top - sizerRect.top + targetRect.height / 2,
        width: settings.marginNoteWidth,
        wrapper,
        x,
      });
    }
    recalculateBlockSpacing(
      sizer,
      (wrapper) => !wrapper.classList.contains("crisp-ann--margin"),
    );

    const documentHeight = Math.max(sizer.scrollHeight, Math.ceil(sizerRect.height));
    for (const side of ["left", "right"] as const) {
      const positions = distributeMarginNotes(
        notes[side].map((note) => ({
          id: note.id,
          desiredY: note.targetY - note.height / 2,
          height: note.height,
        })),
        documentHeight,
        NOTE_GAP,
      );
      const notesById = new Map(notes[side].map((note) => [note.id, note]));
      const positionedNotes: RenderedMarginNote[] = [];
      for (const position of positions) {
        const note = notesById.get(position.id);
        if (!note) {
          continue;
        }
        const wrapperRect = note.wrapper.getBoundingClientRect();
        const wrapperX = wrapperRect.left - sizerRect.left;
        const wrapperY = wrapperRect.top - sizerRect.top;
        applyCssProps(note.label, {
          left: `${note.x - wrapperX}px`,
          top: `${position.y - wrapperY}px`,
          visibility: "visible",
        });
        positionedNotes.push(note);
      }

      let previousBottom = Number.NEGATIVE_INFINITY;
      for (const note of positionedNotes.sort((left, right) => (
        left.label.getBoundingClientRect().top
        - right.label.getBoundingClientRect().top
      ))) {
        let rect = note.label.getBoundingClientRect();
        const minimumTop = previousBottom + NOTE_GAP;
        if (rect.top < minimumTop) {
          const currentTop = Number.parseFloat(note.label.style.top) || 0;
          applyCssProps(note.label, {
            top: `${currentTop + minimumTop - rect.top}px`,
          });
          rect = note.label.getBoundingClientRect();
        }
        previousBottom = rect.bottom;
      }

      for (const note of positionedNotes) {
        note.wrapper.append(makeConnector(
          sizer.ownerDocument,
          note,
          sizerRect,
          settings,
        ));
      }
    }

    const state = this.states.get(sizer);
    const window = sizer.ownerDocument.defaultView;
    if (state && window) {
      if (state.settleTimer !== null) {
        window.clearTimeout(state.settleTimer);
      }
      state.settleTimer = window.setTimeout(() => {
        state.settleTimer = null;
        if (sizer.isConnected) {
          this.settleVisualCollisions(sizer);
        }
      }, SETTLE_DELAY_MS);
    }
  }

  private settleVisualCollisions(sizer: HTMLElement): void {
    const settings = this.getSettings();
    const sizerRect = sizer.getBoundingClientRect();
    for (const side of ["left", "right"] as const) {
      const labels = Array.from(sizer.querySelectorAll<HTMLElement>(
        `.crisp-ann-margin-item--${side}`,
      )).sort((left, right) => (
        left.getBoundingClientRect().top - right.getBoundingClientRect().top
      ));
      let previousBottom = Number.NEGATIVE_INFINITY;
      for (const label of labels) {
        let rect = label.getBoundingClientRect();
        const minimumTop = previousBottom + NOTE_GAP;
        if (rect.top < minimumTop) {
          const currentTop = Number.parseFloat(label.style.top) || 0;
          applyCssProps(label, {
            top: `${currentTop + minimumTop - rect.top}px`,
          });
          rect = label.getBoundingClientRect();
        }
        previousBottom = rect.bottom;
      }
    }

    for (const wrapper of sizer.querySelectorAll<HTMLElement>(".crisp-ann--margin")) {
      for (const connector of wrapper.querySelectorAll(
        ":scope > .crisp-ann-margin-connectors",
      )) {
        connector.remove();
      }
      const label = wrapper.querySelector<HTMLElement>(":scope > .crisp-ann__label");
      const target = wrapper.querySelector<HTMLElement>(".crisp-ann__target");
      const side = label?.classList.contains("crisp-ann-margin-item--left")
        ? "left"
        : label?.classList.contains("crisp-ann-margin-item--right")
          ? "right"
          : null;
      if (!label || !target || !side) {
        continue;
      }
      const targetRect = target.getBoundingClientRect();
      const sizerRect2 = sizer.getBoundingClientRect();
      const targetY = targetRect.top - sizerRect2.top + targetRect.height / 2;
      const x = side === "left"
        ? -settings.marginNoteWidth - CONNECTOR_GAP
        : sizerRect2.width + CONNECTOR_GAP;
      wrapper.append(makeConnector(
        sizer.ownerDocument,
        {
          height: label.getBoundingClientRect().height,
          id: label.id,
          label,
          side,
          target,
          targetY,
          width: label.getBoundingClientRect().width,
          wrapper,
          x,
        },
        sizerRect,
        settings,
      ));
    }
  }
}
