# Développement local

## Prérequis

Utiliser Node.js 22, indiqué par [`.nvmrc`](../../.nvmrc). Une installation
reproductible part de `npm ci`. Les variables facultatives sont décrites dans
[`.env.example`](../../.env.example).

## Boucle quotidienne

```bash
npm ci
npm run dev
npm test
npm run verify
```

`npm run dev` écoute sur toutes les interfaces au port 5173. Pour une tablette,
utiliser l’URL réseau affichée par Vite.

## Validation

`npm run verify` enchaîne :

1. `npm run check:docs` ;
2. `npm run check:structure` ;
3. `npm run check:boundaries` ;
4. `npm run build` et ses trois typechecks ;
5. `npm test`.

Pour cibler un témoin sans redistribuer la suite actuelle :

```bash
npm test -- tests/integration/critical-behavior.test.ts
npm test -- src/persistence/__tests__/project-repository-contract.test.ts
```

## Configurations TypeScript

- `tsconfig.json` vérifie le noyau indépendant de React ;
- `tsconfig.ui.json` vérifie l’application et l’UI ;
- `tsconfig.test.json` vérifie les tests et fixtures.

## Avant une pull request

Utiliser la checklist de
[`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md),
mettre à jour [`../code-map.md`](../code-map.md) si le point d’entrée change et
ne pas introduire de façade ou de dossier sans propriétaire fonctionnel.
