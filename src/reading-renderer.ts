import { findAnnotations } from "./annotation-syntax";

let annotationSequence = 0;

function nextAnnotationLabelId(ownerDocument: Document): string {
  annotationSequence += 1;
  let id = `crisp-ann-note-${annotationSequence}`;
  while (ownerDocument.getElementById(id)) {
    annotationSequence += 1;
    id = `crisp-ann-note-${annotationSequence}`;
  }
  return id;
}

function blockSpacingClass(place: string): string | null {
  if (place.startsWith("top")) {
    return "crisp-ann-block--space-top";
  }
  if (place.startsWith("bottom")) {
    return "crisp-ann-block--space-bottom";
  }
  return null;
}

export function renderAnnotationsInElement(root: HTMLElement): number {
  let rendered = 0;
  const marks = Array.from(root.querySelectorAll<HTMLElement>("mark"));
  for (const mark of marks) {
    if (mark.classList.contains("crisp-ann__target")) {
      continue;
    }
    const directiveNode = mark.nextSibling;
    if (!directiveNode || directiveNode.nodeType !== 3) {
      continue;
    }
    const probePrefix = "==x==";
    const annotation = findAnnotations(`${probePrefix}${directiveNode.textContent ?? ""}`)[0];
    if (!annotation || annotation.from !== 0 || annotation.target !== "x") {
      continue;
    }

    const ownerDocument = mark.ownerDocument;
    const wrapper = ownerDocument.createElement("span");
    wrapper.classList.add(
      "crisp-ann",
      `crisp-ann--${annotation.spec.place}`,
      `crisp-ann--${annotation.spec.color}`,
    );
    if (!annotation.spec.mark) {
      wrapper.classList.add("crisp-ann--no-mark");
    }

    const label = ownerDocument.createElement("span");
    label.className = "crisp-ann__label";
    label.id = nextAnnotationLabelId(ownerDocument);
    label.setAttribute("role", "note");
    label.textContent = annotation.spec.note;

    const block = mark.closest<HTMLElement>("p, li, td, th, blockquote");
    block?.classList.add("crisp-ann-block");
    const spacingClass = blockSpacingClass(annotation.spec.place);
    if (spacingClass) {
      block?.classList.add(spacingClass);
    }

    mark.parentNode?.insertBefore(wrapper, mark);
    wrapper.append(mark, label);
    mark.classList.add("crisp-ann__target");
    mark.setAttribute("aria-describedby", label.id);

    const directiveLength = annotation.directiveTo - annotation.directiveFrom;
    const textNode = directiveNode as Text;
    textNode.data = textNode.data.slice(directiveLength);
    if (textNode.data.length === 0) {
      textNode.remove();
    }
    rendered += 1;
  }
  return rendered;
}
