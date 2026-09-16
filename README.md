# Žrádlomapa

Webová aplikace nad živým API Gastromapy. Repozitář záměrně neobsahuje žádné snapshoty podniků ani stažené fotografie.

**Vytvořeno pouze pro edukativní účely. Neoficiální projekt bez spojení s Gastromapou.**

## Architektura

- browser načítá podniky po stránkách přes `GET /api/restaurants`
- `server.mjs` požadavek okamžitě přepošle na `https://api.hejlik.cz/api/v1/restaurants`
- proxy používá `Cache-Control: no-store` a data nikam nezapisuje
- fotografie se zobrazují přímo ze vzdálených URL vrácených živým API
- v repozitáři nejsou žádné JSON/CSV snapshoty ani lokální kopie fotografií

Proxy je nutná, protože upstream API neposílá CORS hlavičky a browser ho z jiné domény nemůže bezpečně číst přímo.

## Lokální spuštění

Vyžaduje Node.js 20+.

```bash
npm run dev
```

Potom otevři `http://127.0.0.1:4173`.

## Produkční nasazení

Nasazení musí podporovat Node proces ze `server.mjs`, případně samostatnou serverless/edge proxy se stejnou cestou `/api/restaurants`. Samotný GitHub Pages neumí serverovou proxy; statický frontend tam lze hostovat jen tehdy, když meta tag `zradlomapa-api` v `index.html` ukazuje na nasazenou HTTPS proxy.

Pro oddělenou proxy nastav:

```bash
ALLOWED_ORIGIN=https://johny834.github.io npm start
```

Pak změň `content` meta tagu `zradlomapa-api` na veřejnou URL proxy.

## Ochrana proti návratu snapshotů

```bash
npm run check
```

Kontrola selže, pokud někdo začne verzovat:

- `data/`
- `assets/restaurant-covers/`
- `restaurants.json` nebo `restaurants-backup.json`
- soubor větší než 2 MB
- staré odkazy na snapshotovací skripty

Stejná kontrola běží v GitHub Actions při každém pushi a pull requestu.

## Data policy

Repozitář smí obsahovat pouze zdrojový kód a vlastní statické assety aplikace. Odpovědi Gastromapa API jsou pouze tranzitní data aktuálního HTTP požadavku a nesmí se commitovat, ukládat do cache, Actions artifacts ani dlouhodobě logovat.
