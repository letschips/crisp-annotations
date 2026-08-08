export function renderAboutCard(
  container: HTMLElement,
  pluginName: string,
  description: string,
): void {
  const document = container.ownerDocument;
  const card = document.createElement("section");
  card.className = "crisp-ann-about";

  const title = document.createElement("h3");
  title.className = "crisp-ann-about__title";
  title.textContent = `关于 ${pluginName}`;

  const copy = document.createElement("p");
  copy.className = "crisp-ann-about__description";
  copy.textContent = description;

  const byline = document.createElement("p");
  byline.className = "crisp-ann-about__author";
  const label = document.createElement("span");
  label.textContent = "作者：";
  const author = document.createElement("a");
  author.className = "crisp-ann-about__author-link";
  author.textContent = "小红书 letschips";
  author.href = "https://xhslink.cn/m/3MwtKu4822b";
  author.target = "_blank";
  author.rel = "noopener noreferrer";
  byline.append(label, author);

  card.append(title, copy, byline);
  container.append(card);
}
