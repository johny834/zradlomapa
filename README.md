# Žrádlomapa

Jednoduchá statická web appka nad synchronizovaným datasetem podniků.

** Vytvořeno pouze pro edukativní účely **

## Jak to funguje

- `scripts/sync-data.mjs` stáhne všechny podniky z `https://api.hejlik.cz/api/v1/restaurants`
- uloží snapshot do `data/restaurants.json`
- frontend v `index.html` + `app.js` hledá lokálně bez přímého volání API z browseru

## Proč nefetchovat API rovnou z frontendu

Protože `api.hejlik.cz` neposílá CORS hlavičky, takže browserový fetch z GitHub Pages by byl rozbitý.

## Použití

```bash
npm run sync
python3 -m http.server 4173
```

Pak otevři `http://localhost:4173`.
