#!/usr/bin/env node
// Generates README*.md, cases/*.md, images/ and data.json from the aiclothswap prompt data.
// Usage: node scripts/generate.mjs --src /path/to/aiclothswap
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.resolve(args.src || process.env.AICLOTHSWAP_DIR || '../../aiclothswap-mvp');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const DATA = path.join(SRC, 'content/inspiration');
const IMG = path.join(SRC, 'apps/web-mirror/site/inspiration/img');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const categories = readJson('categories.json');
const CJK = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff]/;
const items = readJson('items.json')
  .filter((r) => r.review?.status === 'approved' && r.content_status === 'complete' && !r.is_placeholder)
  .filter((r) => r.en?.title && r.filled_prompt && !CJK.test(r.en.title + r.filled_prompt))
  .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));

const SITE = 'https://aiclothswap.net';
const utm = `utm_source=github&utm_medium=awesome&utm_campaign=${cfg.repo}`;
const MODELS = { 'gpt-image-2.5': 'GPT Image 2.5', 'nano-banana-pro': 'Nano Banana Pro', 'nanobanana-pro': 'Nano Banana Pro' };
const modelName = (m) => MODELS[m] || m;

// Images
const imgDir = path.join(ROOT, 'images');
fs.mkdirSync(imgDir, { recursive: true });
const keep = new Set();
for (const r of items) {
  const src = path.join(IMG, r.slug, 'result-thumb.webp');
  if (!fs.existsSync(src)) throw new Error(`missing image ${src}`);
  const name = `${r.slug}.webp`;
  keep.add(name);
  const dst = path.join(imgDir, name);
  const buf = fs.readFileSync(src);
  if (!fs.existsSync(dst) || !buf.equals(fs.readFileSync(dst))) fs.writeFileSync(dst, buf);
}
for (const f of fs.readdirSync(imgDir)) if (!keep.has(f)) fs.rmSync(path.join(imgDir, f));

const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n.json'), 'utf8'));
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const BASE = cfg.basePath || '/inspiration'; // switch to '/outfit-swap-prompts' when it ships on aiclothswap main
const detailL = (slug) => `${SITE}${BASE}/p/${slug}/?${utm}`;
const homeL = () => `${SITE}${BASE}?${utm}`;
const fence = (t) => {
  let f = '```';
  while (t.includes(f)) f += '`';
  return `${f}text\n${t.trim()}\n${f}`;
};
const md = (s) => String(s || '').replace(/\|/g, '\\|');
const badge = (s) => encodeURIComponent(String(s).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_'));

function badges(rel) {
  return Object.values(I18N)
    .map((t) => `[![${t.flag} ${t.name}](https://img.shields.io/badge/${badge(`${t.flag} ${t.name}`)}-${badge(t.view)}-${t.color})](${rel}${t.file})`)
    .join('\n');
}

// Prompt-first: title, prompt, model; then image + detail link as supporting material.
function card(r, t, rel) {
  const title = md(r.en.title);
  const w = r.images?.after?.width || 1, h = r.images?.after?.height || 1;
  const note = r.en.short_note && !CJK.test(r.en.short_note) && t.file === 'README.md' ? `> ${String(r.en.short_note).replace(/\n+/g, ' ')}\n` : '';
  return [
    `### ${title}`,
    '',
    fence(r.filled_prompt),
    '',
    `**${t.model}:** ${modelName(r.generation_model)}`,
    '',
    note,
    `<a href="${detailL(r.slug)}"><img src="${rel}images/${r.slug}.webp" alt="${title.replace(/"/g, '&quot;')}" width="${w >= h ? 320 : 240}"></a>`,
    '',
    `[${t.open}](${detailL(r.slug)})`,
    '',
  ].join('\n');
}

const byCat = categories.map((c) => ({ c, list: items.filter((r) => r.category === c.slug) })).filter((x) => x.list.length);
const K = cfg.featuredPerCategory || 6;
const catName = (c, t) => t.cats?.[c.slug] || c.en || c.slug;

function readme(t) {
  const v = { n: items.length, home: homeL() };
  const out = [`# ${fill(t.title, v)}`, '', badges(''), '', '[![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)](LICENSE)', ''];
  out.push(fill(t.intro, v), '', `👉 [${t.browse}](${homeL()})`, '');
  out.push(`## ${t.contents}`, '');
  for (const { c, list } of byCat) out.push(`- ${c.icon || ''} [${catName(c, t)}](#${c.slug}) (${list.length}) · [${t.all}](cases/${c.slug}.md)`);
  out.push('');
  for (const { c, list } of byCat) {
    out.push(`<a id="${c.slug}"></a>`, '', `## ${c.icon || ''} ${catName(c, t)}`, '');
    out.push(`${fill(t.featured, { k: Math.min(list.length, K) })} · [${fill(t.seeAll, { n: list.length })}](cases/${c.slug}.md)`, '');
    for (const r of list.slice(0, K)) out.push(card(r, t, ''));
  }
  out.push(`## ${t.licenseH}`, '', t.license, '');
  return out.join('\n');
}

function casePage(c, list, t) {
  return [`# ${c.icon || ''} ${catName(c, t)} · AI Outfit Swap Prompts`, '', `[← README](../README.md) · ${list.length} prompts · [aiclothswap.net](${homeL()})`, '', ...list.map((r) => card(r, t, '../'))].join('\n');
}

fs.rmSync(path.join(ROOT, 'cases'), { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'cases'), { recursive: true });
for (const { c, list } of byCat) fs.writeFileSync(path.join(ROOT, 'cases', `${c.slug}.md`), casePage(c, list, I18N.en));
for (const t of Object.values(I18N)) fs.writeFileSync(path.join(ROOT, t.file), readme(t));
fs.writeFileSync(
  path.join(ROOT, 'data.json'),
  JSON.stringify({ count: items.length, categories: Object.fromEntries(byCat.map(({ c, list }) => [c.slug, list.length])), slugs: items.map((r) => r.slug) }, null, 2) + '\n'
);
console.log(`${cfg.repo}: ${items.length} items, ${byCat.length} categories, ${Object.keys(I18N).length} READMEs`);
