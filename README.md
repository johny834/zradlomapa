# Žrádlomapa

Webová aplikace nad živým API Gastromapy. Repozitář záměrně neobsahuje žádné snapshoty podniků ani stažené fotografie.

**Vytvořeno pouze pro edukativní účely. Neoficiální projekt bez spojení s Gastromapou.**

## Architektura

- browser načítá podniky živě po stránkách z Gastromapa API
- produkční GitHub Pages používá `r.jina.ai` pouze jako tranzitní CORS bridge; v repozitáři se odpovědi neukládají
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

Současný GitHub Pages deployment používá veřejný tranzitní CORS bridge uvedený v meta tagu `zradlomapa-api`. Dlouhodobě je lepší nasadit vlastní Node/serverless/edge proxy ze `server.mjs` a meta tag přepnout na její HTTPS URL.

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

## Rozhraní (mobile-first)

- Jedno hledání a typ podniku; seznam a mapa sdílejí stejné filtry.
- Hledání ignoruje diakritiku. Seznam vykresluje 24 položek, další jsou dostupné tlačítkem.
- Detail nabízí fotografie z API, kontakty, navigaci a otevírací dobu, pokud je zdroj poskytuje.
- Nulové výsledky znamenají prázdnou mapu, nikoli přepnutí na všechny podniky.
- Poloha se zjišťuje pouze po stisku „Moje poloha“; není nutná pro hledání.
- Rozhraní funguje během načítání; po výpadku je dostupné opakování bez obnovení stránky.
- `api.js` odděluje živé HTTP požadavky od UI, používá timeout, omezené opakování a `no-store`.
- Na localhost se používá vlastní Node proxy, na Pages konfigurovaný CORS bridge s `X-No-Cache`.
- Žádné restaurační odpovědi ani fotografie se neukládají do localStorage, service workeru či repozitáře. Ukládá se pouze preference vzhledu.

### Ověření změn

Vedle `npm run check` ověřte v prohlížeči s živým API šířky 320, 390, 768 a 1440 px; hledání bez diakritiky; další výsledky; prázdnou a filtrovanou mapu; detail a navigaci; přímý odkaz na podnik mimo výchozí město; Escape a návrat fokusu; tmavý vzhled; výpadek s opakováním. Pro GitHub Pages ověřte také živou cestu přes CORS bridge. Testovací data ani fotografie neukládejte do repozitáře.
