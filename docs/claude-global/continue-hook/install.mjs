#!/usr/bin/env node
// Instala (ou remove, com --uninstall) o hook "continue-until-done" no Claude Code do usuário.
//
// O que faz, em ordem:
//   1. copia continue-until-done.mjs para ~/.claude/hooks/
//   2. faz BACKUP de ~/.claude/settings.json (settings.json.bak-<data>)
//   3. adiciona uma única entrada em hooks.Stop (não mexe em mais nada do arquivo)
// Se o settings.json não for um JSON válido, aborta sem escrever nada.
// Reinicie o Claude Code depois de instalar.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = "continue-until-done.mjs";
const uninstall = process.argv.includes("--uninstall");
const here = dirname(fileURLToPath(import.meta.url));
const claudeDir = join(homedir(), ".claude");
const target = join(claudeDir, "hooks", SCRIPT);
const settingsPath = join(claudeDir, "settings.json");

const isOurs = (entry) => Array.isArray(entry?.hooks) && entry.hooks.some((h) => Array.isArray(h?.args) && h.args.some((a) => String(a).endsWith(SCRIPT)));
const fail = (msg) => {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
};

let settings = {};
if (uninstall && !existsSync(settingsPath)) {
  console.log(`Nada a remover: ${settingsPath} não existe.`);
  process.exit(0);
}
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8").replace(/^\uFEFF/, "")); // o PowerShell 5 grava BOM
  } catch (e) {
    fail(`${settingsPath} não é um JSON válido (${e.message}). Nada foi alterado.`);
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) fail(`${settingsPath} deve conter um objeto JSON. Nada foi alterado.`);
}

if (settings.hooks !== undefined && (settings.hooks === null || typeof settings.hooks !== "object" || Array.isArray(settings.hooks))) fail(`"hooks" em settings.json tem formato inesperado. Nada foi alterado.`);
if (settings.hooks?.Stop !== undefined && !Array.isArray(settings.hooks.Stop)) fail(`"hooks.Stop" em settings.json tem formato inesperado. Nada foi alterado.`);

if (existsSync(settingsPath)) {
  const backup = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(settingsPath, backup);
  console.log(`Backup: ${backup}`);
}

const stop = (settings.hooks?.Stop ?? []).filter((entry) => !isOurs(entry));
if (!uninstall) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(here, SCRIPT), target);
  // caminho absoluto com "/" funciona no Windows e evita problemas de aspas; forma "exec" (command + args) é a recomendada na doc
  stop.push({ hooks: [{ type: "command", command: "node", args: [target.replace(/\\/g, "/")], timeout: 30 }] });
}

settings.hooks = { ...(settings.hooks ?? {}) };
if (stop.length) settings.hooks.Stop = stop;
else delete settings.hooks.Stop;
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

mkdirSync(claudeDir, { recursive: true });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log(uninstall ? `Hook removido de ${settingsPath}.` : `Hook instalado: ${target}\nRegistrado em: ${settingsPath}`);
console.log("Reinicie o Claude Code para valer.");
