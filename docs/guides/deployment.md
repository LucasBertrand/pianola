# Déploiement

## CI GitHub

Le workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) utilise
Node.js depuis `.nvmrc`, installe avec `npm ci` et exécute `npm run verify` sur
les pushes vers `main` et les pull requests.

## Vercel

[`vercel.json`](../../vercel.json) configure le build Vite et le répertoire
`dist/`. Pour une première connexion :

1. importer le dépôt dans Vercel ;
2. conserver `npm run build` comme commande de build ;
3. conserver `dist` comme sortie ;
4. vérifier le déploiement de prévisualisation ;
5. promouvoir uniquement après une CI verte.

Les pushes suivants sont déployés selon la branche et les réglages du projet
Vercel. Pianola n’exige aucune variable secrète pour son fonctionnement local.

## Retour arrière

Privilégier la promotion d’un déploiement Vercel antérieur ou un revert Git
explicite. Ne jamais modifier manuellement les fichiers de `dist/` : ils sont
recréés par Vite.
