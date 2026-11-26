import { cp, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import console from "node:console";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Runtime whitelist. data.json (settings + license code) is never copied.
const requiredFiles = ["main.js", "manifest.json", "styles.css"];
const optionalFiles = ["LICENSE", "THIRD_PARTY_NOTICES.md", "CHANGELOG.md"];
const optionalDirectories = ["assets", "audio"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function requireDirectory(path, label) {
  try {
    if (!(await stat(path)).isDirectory()) {
      throw new Error(`${label} is not a directory: ${path}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} does not exist: ${path}`, { cause: error });
  }
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error("Usage: node scripts/deploy.mjs <obsidian-vault-path>");
  }

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const vault = resolve(process.argv[2]);
  await requireDirectory(vault, "Vault");
  await requireDirectory(resolve(vault, ".obsidian"), "Obsidian configuration directory");

  const manifest = JSON.parse(await readFile(resolve(projectRoot, "manifest.json"), "utf8"));
  if (typeof manifest.id !== "string" || manifest.id.length === 0) {
    throw new Error("manifest.json must contain a plugin id.");
  }
  for (const file of requiredFiles) {
    await stat(resolve(projectRoot, file));
  }

  const destination = resolve(vault, ".obsidian", "plugins", manifest.id);
  if (await exists(resolve(destination, ".git"))) {
    throw new Error(`Refusing to deploy into a git working tree: ${destination}`);
  }
  await mkdir(destination, { recursive: true });

  const copied = [];
  for (const file of [...requiredFiles, ...optionalFiles]) {
    const source = resolve(projectRoot, file);
    if (!(await exists(source))) continue;
    await copyFile(source, resolve(destination, file));
    copied.push(file);
  }
  for (const directory of optionalDirectories) {
    const source = resolve(projectRoot, directory);
    if (!(await exists(source))) continue;
    await cp(source, resolve(destination, directory), { recursive: true });
    copied.push(`${directory}/`);
  }
  // 安装目录里已有的说明和版本表跟着刷新，免得留着旧版本；没有的不新增
  for (const extra of ["README.md", "package.json", "versions.json"]) {
    const target = resolve(destination, extra);
    try {
      await stat(target);
      await copyFile(resolve(projectRoot, extra), target);
    } catch {
      // 安装目录或源码里没有这个文件：跳过
    }
  }
  console.log(`Deployed ${manifest.name} ${manifest.version} to ${destination}`);
  console.log(`Copied: ${copied.join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
