# Žrádlomapa

Jednoduchá statická web appka nad synchronizovaným datasetem podniků.

**Vytvořeno pouze pro edukativní účely**

## CZ

### Jak to funguje

- `scripts/sync-data.mjs` stáhne všechny podniky z `https://api.hejlik.cz/api/v1/restaurants`
- uloží čerstvý snapshot do `data/restaurants.json`
- před přepsáním zachová poslední funkční snapshot jako `data/restaurants-backup.json`
- `scripts/backup-place-images.mjs` stáhne první ještě živou fotku podniku do `assets/restaurant-covers/` a připíše ji jako `localHero`
- frontend v `index.html` + `app.js` hledá lokálně bez přímého volání API z browseru
- loader má fallback `live dataset -> GitHub backup -> local cache`

### Proč nefetchovat API rovnou z frontendu

Protože `api.hejlik.cz` neposílá CORS hlavičky, takže browserový fetch z GitHub Pages by byl rozbitý.

### Použití

```bash
npm run sync
npm run backup:images
python3 -m http.server 4173
```

Pak otevři `http://localhost:4173`.

## EN

### What it does

Žrádlomapa is a static web app built on top of a synchronized restaurant dataset.

- `scripts/sync-data.mjs` downloads all venues from `https://api.hejlik.cz/api/v1/restaurants`
- it saves the fresh snapshot into `data/restaurants.json`
- before overwriting it, the script preserves the last known good snapshot as `data/restaurants-backup.json`
- `scripts/backup-place-images.mjs` downloads the first still-working venue photo into `assets/restaurant-covers/` and stores it as `localHero`
- the frontend in `index.html` + `app.js` runs local search without calling the live API from the browser
- the dataset loader uses a fallback chain: `live dataset -> GitHub backup -> local cache`

### Why not fetch the API directly from the frontend

Because `api.hejlik.cz` does not send CORS headers, so a browser fetch from GitHub Pages would fail.

### Local usage

```bash
npm run sync
npm run backup:images
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
