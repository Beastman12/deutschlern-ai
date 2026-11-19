/**
 * Static frontend wiring checks: assets, ES-module imports/exports, icons and
 * the navigation contract.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const JS_DIR = (root) => path.join(root, 'frontend', 'js');
const INDEX_FILE = (root) => path.join(root, 'frontend', 'index.html');

function collectExports(source) {
  const names = new Set();
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name.trim());
    }
  }
  return names;
}

function checkImports(root, modules, exportsByFile) {
  const problems = [];
  for (const [file, source] of modules) {
    for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
      const clause = match[1];
      const specifier = match[2];
      if (!specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(path.join(JS_DIR(root), file)), specifier);
      if (!fs.existsSync(target)) {
        problems.push(`${file}: cannot resolve ${specifier}`);
        continue;
      }
      const exported = exportsByFile.get(path.basename(target));
      if (!exported) continue;

      const braced = clause.match(/\{([\s\S]*)\}/);
      if (braced) {
        for (const part of braced[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0];
          if (name && !exported.has(name)) {
            problems.push(`${file}: "${name}" is not exported by ${path.basename(target)}`);
          }
        }
      }

      const withoutBraces = clause.replace(/\{[^}]*\}/g, '').replace(/\*\s+as\s+\w+/g, '').trim();
      if (withoutBraces.replace(/^,|,$/g, '').trim()) {
        problems.push(`${file}: default import from ${path.basename(target)} (no default exports)`);
      }
    }
  }
  return problems;
}

export async function frontendChecks(root) {
  const index = fs.readFileSync(INDEX_FILE(root), 'utf8');

  /* Local asset references ------------------------------------------------- */
  const refs = [...index.matchAll(/(?:href|src)="\.\/([^"]+)"/g)].map((match) => match[1]);
  const missingAssets = refs.filter((ref) => !fs.existsSync(path.join(root, 'frontend', ref)));

  /* Modules and wiring ----------------------------------------------------- */
  const modules = fs
    .readdirSync(JS_DIR(root))
    .filter((file) => file.endsWith('.js'))
    .map((file) => [file, fs.readFileSync(path.join(JS_DIR(root), file), 'utf8')]);
  const exportsByFile = new Map(modules.map(([file, source]) => [file, collectExports(source)]));
  const wiringProblems = checkImports(root, modules, exportsByFile);

  /* Icons ------------------------------------------------------------------ */
  const spriteIds = new Set([...index.matchAll(/<symbol id="i-([^"]+)"/g)].map((match) => match[1]));
  const usedIcons = new Set([...index.matchAll(/href="#i-([^"]+)"/g)].map((match) => match[1]));
  for (const [, source] of modules) {
    for (const match of source.matchAll(/\bicon\(\s*['"]([a-z0-9-]+)['"]/g)) usedIcons.add(match[1]);
  }

  /* Navigation ------------------------------------------------------------- */
  const routesModule = await import(pathToFileURL(path.join(JS_DIR(root), 'routes.js')).href);
  const { NAV_GROUPS, ROUTES, MOBILE_NAV, QUICK_ACTIONS } = routesModule;

  const navItems = NAV_GROUPS.flatMap((group) => group.items.map((id) => ({ id, group: group.label })));
  for (const item of navItems) {
    const route = ROUTES[item.id];
    if (!route) wiringProblems.push(`navigation references unknown route "${item.id}"`);
    else if (route.group !== item.group) {
      wiringProblems.push(`route "${item.id}" is in "${route.group}" but listed under "${item.group}"`);
    }
  }
  for (const item of MOBILE_NAV) {
    if (item.route !== 'more' && !ROUTES[item.route]) {
      wiringProblems.push(`mobile navigation references unknown route "${item.route}"`);
    }
    usedIcons.add(item.icon);
  }
  for (const action of QUICK_ACTIONS) usedIcons.add(action.icon);

  const routeList = Object.values(ROUTES);
  for (const route of routeList) usedIcons.add(route.icon);

  const paths = routeList.map((route) => route.path);
  const badPaths = routeList
    .filter((route) => !/^#\/[a-z0-9/-]+$/.test(route.path))
    .map((route) => `${route.id}: invalid path "${route.path}"`);
  if (new Set(paths).size !== paths.length) badPaths.push('duplicate route paths found');

  const liveRoutes = routeList.filter((route) => route.status === 'live');
  const plannedRoutes = routeList.filter((route) => route.status === 'planned');
  const missingMilestones = plannedRoutes
    .filter((route) => !Number.isInteger(route.milestone))
    .map((route) => route.id);
  const missingDescriptions = plannedRoutes
    .filter((route) => !route.description || !Array.isArray(route.features) || route.features.length < 4)
    .map((route) => route.id);

  const missingIcons = [...usedIcons].filter((name) => !spriteIds.has(name));

  return {
    assetCount: refs.length,
    missingAssets,
    moduleCount: modules.length,
    wiringProblems,
    iconCount: spriteIds.size,
    missingIcons,
    navigation: {
      navItemCount: navItems.length,
      routeCount: routeList.length,
      liveRoutes,
      plannedRoutes,
      roadmapRoute: Boolean(ROUTES.roadmap && ROUTES.roadmap.status === 'live'),
      missingMilestones,
      missingDescriptions,
      badPaths,
    },
  };
}
