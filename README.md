# Crisp Annotations

Adds hand-drawn arrows and handwritten-style notes to inline Markdown highlights in Obsidian.

## Features

- **Inline & Margin Layouts**: Display handwritten notes near target text or automatically layout them in reading margins.
- **Hand-drawn Arrows & Spirals**: Choose from hand-drawn, coiled spiral, wavy, or straight connectors.
- **Quick Annotation**: Add or edit annotations via hotkey, context menu, or command palette.
- **Annotation Center**: Browse, search, edit, copy, highlight, or remove annotations, then jump directly to their targets.
- **Active Recall**: Mask handwritten notes and reveal them on demand without changing the Markdown or page layout.
- **Pure Markdown Storage**: Annotations are saved as standard Markdown syntax `==highlight=={ann note="..."}`.

## Installation

1. Open Obsidian -> Settings -> Community plugins.
2. Turn off Safe Mode and search for `Crisp Annotations`.
3. Click Install and then Enable.

## How to Use

1. Select one or more lines of text in editing mode.
2. Right-click and select `Add annotation`, or run `Crisp Annotations: Add or edit annotation` from the command palette.
3. Fill in the note, choose place direction, color, and whether to keep the mark.
4. Switch to reading mode to view the rendered hand-drawn annotation.

## Developer Policy & Network Disclosure

- **Optional Premium Features & License Activation**: Core annotation reading, rendering, and outline features are free to use. Premium visual customization options can be unlocked with an offline/online Crisp Suite license code.
- **Network Requests**: When validating a license code, an HTTPS request is sent to `https://crisp-license.helloherve-xsn.workers.dev/api/verify-device` solely for device count registration. If offline, the plugin falls back to local offline Ed25519 cryptographic verification. No vault note contents or private data are ever sent over the network.

---

# Crisp Annotations (中文说明)

在 Obsidian 中把普通高亮扩展成带手绘箭头的行内标注。编辑模式保留可读、可移植的 Markdown；阅读模式渲染方向、颜色、箭头和手写标签。

## 安装

1. 解压 ZIP，得到 `crisp-annotations` 文件夹。
2. 把整个文件夹放进仓库的 `.obsidian/plugins/` 目录。
3. 打开 Obsidian → 设置 → 第三方插件，启用 `Crisp Annotations`。

## 推荐用法

1. 在编辑模式选择一段文字；可跨行选择。
2. 右键并选择 `Add annotation`，或从命令面板运行 `Crisp Annotations: Add or edit annotation`。
3. 填写短注释，选择方向、颜色和是否保留高亮。
4. 切换到阅读模式查看完整效果。

标注弹窗底部会显示当前阅读布局、连接线、线型和字体摘要。布局、连接线和字体属于全局外观，可通过 `Appearance` 直接进入插件设置；方向、颜色和高亮仍保存在当前这条标注中。打开设置时，尚未提交的注释草稿会保留。

填写后可按 `⌘ Enter`（macOS）或 `Ctrl Enter`（Windows/Linux）直接提交；空注释会在弹窗内提示，不会打断当前编辑。

光标进入已有标注时，再运行同一个命令可编辑。右键菜单会按当前状态显示 `Edit annotation`、开关目标高亮和 `Remove annotation`，移除时保留原文字。

如果只想快速写一句话，可运行 `Crisp Annotations: Quick annotation`：弹出轻量单行输入框，按 Enter 即可完成，并复用最近一次方向、颜色和高亮选择。

## 标注中心与导出

- 运行 `Crisp Annotations: Open annotation center`，可在右侧边栏切换查看“当前文档”或“整个仓库”的标注。
- 全库模式支持搜索原文、标注内容和文件路径，也可以按颜色筛选；结果按文件分组，点击后会打开对应文章、滚动到原文位置并短暂高亮目标。
- 鼠标移到任意标注上，可以直接编辑、开关原文高亮、复制“原文 + 标注”或删除标注；这些操作不要求先切回编辑模式。
- 在阅读模式单击手写标注文字，或键盘聚焦后按 Enter / 空格，可遮罩或揭晓内容；双击或按 Shift+Enter 可编辑该条标注。
- 设置中的“自测遮罩模式”会默认隐藏所有标注文字，逐条点击即可揭晓；关闭后恢复普通阅读状态。
- 阅读文章时，面板会自动突出并跟随滚动到当前视口附近的标注。按 `⌘/Ctrl + Alt + ↑` 或 `⌘/Ctrl + Alt + ↓` 可跳到上一条或下一条标注，并在首尾循环。
- 运行 `Crisp Annotations: Export annotations summary to clipboard`，可把当前文档的目标文字、颜色、方向和注释复制为 Markdown 清单。
- 标注中心会跟随 Markdown 文件的创建、编辑、重命名与删除增量更新。全库内容只在本地读取和索引，不会发送笔记内容。

## Markdown 语法

```markdown
==迁移指南=={ann note="发布前先复核" place=bottom color=amber}
```

可选字段：

- `place`: `top`、`top-right`、`right`、`bottom-right`、`bottom`、`bottom-left`、`left`、`top-left`
- `color`: `neutral`、`amber`、`orange`、`blue`、`green`、`red`、`purple`、`rainbow`、`custom`
- `mark`: `on` 或 `off`

手写语法省略字段时，默认是 `place=bottom color=neutral mark=on`。通过命令新建时使用插件设置中的默认值。

## 标注字体

在 Obsidian → 设置 → Crisp Annotations → `Annotation font` 中可以选择：

- `Bundled handwriting`：使用插件自带的 Shantell Sans；中文自动回退到系统楷体。
- `Follow body text`：跟随当前主题或 Obsidian 设置中的正文字体。
- `Custom font`：输入 CSS `font-family` 值，例如 `"LXGW WenKai", cursive`。字体需要已安装在当前设备上。

自定义字体为空或无效时会安全回退，不影响正文内容。该设置只控制阅读模式中的手写标签；被标注的文字继续使用文章正文字体，编辑模式徽章继续使用 Obsidian 界面字体。

## 箭头与自定义颜色

在 Obsidian → 设置 → Crisp Annotations 中可以统一调整所有标注的箭头：

- `Arrow style`：`Hand-drawn`、`Straight`、`Custom curve`、`Coiled spiral`、`Wavy line` 或 `Double line`。旋转样式会沿连接线绘制连续多圈，并向箭头方向逐渐展开。
- `Arrow line`：`Solid` 或 `Dashed`；虚线只作用于连接线，箭头尖保持清晰。
- `Custom curve`：在 `-100` 到 `100` 之间调整弯曲方向和幅度，仅在 `Custom curve` 模式启用。

`Custom annotation color` 同时提供取色器和 `#RRGGBB` 输入框。要使用这个色号，可在添加或编辑标注时选择 `Custom`，也可以把 `Default color` 设置为 `Custom`。自定义色会用于箭头、连接线、手写标签和轻量高亮。

`Color theme preset` 可整体切换 Classic Crisp、Morandi Muted、Kindle Paper 与 Cyberpunk Neon 四套调色板；每条标注保存的是语义颜色名称，之后切换主题无需改写 Markdown。

## 页边标注

在 Obsidian → 设置 → Crisp Annotations → `Annotation layout` 中可以选择：

- `Inline`：沿用正文附近的行内标注。
- `Smart margins`：阅读模式有足够空白时，把标注自动分配到左右页边；带方向的标注优先遵循原方向，其余标注自动均衡。
- `Left margin`：尽量统一放到左侧。
- `Right margin`：尽量统一放到右侧。

`Margin note width` 可以在 `140–260 px` 之间调整页边文字宽度。页边模式会自动避让同侧标注，并用当前箭头样式、实线或虚线以及标注颜色绘制长连接线。

如果窗口、分栏或移动设备没有足够的页边空间，标注会自动退回原有行内布局，不挤压正文。这个设置只影响阅读模式，Markdown 写法和编辑方式不变。

设置页按“新标注默认值 → 阅读布局 → 标注外观 → 连接线 → 编辑模式”分组。只在对应模式下有意义的选项会自动出现，例如页边宽度、自定义字体和自定义曲率。打开 `Remember last choice` 后，新标注会复用最近一次方向、颜色和高亮状态。

## 设计边界

- 标注目标必须是非空、无 `==` 的单行文本。
- 编辑模式在光标离开标注后，将元数据折叠成小徽章；光标进入时显示原始 Markdown，便于精确修改。
- 阅读模式使用真实 DOM 标签，不依赖伪元素承载文字，便于复制与无障碍描述。
- 手机和平板模式统一把标签放到目标下方，减少横向溢出。
- 页边模式只在阅读区域具有足够空白时启用，并自动处理同侧标签碰撞。
- 彩虹色使用平滑、缓慢的线性变化，并遵循系统“减少动态效果”设置。
- 这是行内标注，不替代语义型脚注。需要出处、引用或长解释时，仍建议使用 Markdown 脚注。

## 兼容性与隐私

- 需要 Obsidian 1.8.0 或更高版本，桌面端和移动端均可使用。
- 插件只处理当前仓库中的 Markdown 与本地设置，不联网、不上传笔记，也不包含遥测。
- 标注语法保存在 Markdown 中；停用插件后，原始文字与元数据仍然可见、可编辑。

## 开发检查

```sh
npm run check
```

授权与第三方来源见 `LICENSE`、`THIRD_PARTY_NOTICES.md` 和 `assets/OFL.txt`。
