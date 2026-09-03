# OnkoFlow: lokální departmental proof-of-concept

Tento postup instaluje pouze **diagnostickou verzi** OnkoFlow. Pacientská část nadále
pracuje se smyšlenými daty v paměti a klinická data se do sdílené složky zatím
neukládají.

Účelem první fáze je ověřit, zda konkrétní verze Microsoft Edge a SMB prostředí ÚVN
spolehlivě podporují operace, na kterých má budoucí úložiště stát.

## Bezpečnostní hranice

- GitHub a Vercel obsahují pouze zdrojový kód a syntetická data.
- Skutečná pacientská data se nesmějí zadávat do demo ani diagnostického buildu.
- Diagnostika ukládá do IndexedDB pouze browserový `FileSystemDirectoryHandle`.
- Diagnostika nikdy neukládá klinický obsah do IndexedDB.
- `app` a `data` jsou dvě oddělené složky. Aktualizace `app` se nesmí dotknout `data`.
- Úspěšný test na jednom počítači není důkazem bezpečné víceuživatelské databáze.

## 1. Připravte sdílené složky

Ve Windows Průzkumníkovi vytvořte:

```text
\\share4.uvn.cz\gyn\OnkoFlow\
├── app\
└── data\
```

Pro první test musí být `data` prázdná. Nevytvářejte v ní žádné skutečné záznamy.

Ověřte na každé testovací stanici, že váš běžný nemocniční účet může v `data`:

1. vytvořit obyčejný textový soubor;
2. otevřít jej;
3. změnit jej;
4. smazat jej.

Pokud selže už tento Windows test, nepokračujte. Jde o oprávnění SMB, nikoli o chybu
OnkoFlow.

## 2. Stáhněte hotový ZIP v prohlížeči

Na pracovní stanici není potřeba Git, Node.js ani PowerShell build:

1. Otevřete
   [nejnovější GitHub Release](https://github.com/AtecHEvolutioN/onkoflow-oncology-mockup/releases/latest).
2. V části **Assets** stáhněte soubor
   `OnkoFlow-department-vX.Y.Z-XXXXXXXXXXXX.zip`.
3. Stáhněte také stejně pojmenovaný soubor s příponou `.sha256`.
4. Rozbalte ZIP do dočasné složky. V jejím kořeni musí být `index.html` a složka
   `_next`; nesmí tam být složka `data`.

Volitelná kontrola integrity v PowerShellu:

```powershell
Get-FileHash .\OnkoFlow-department-vX.Y.Z-XXXXXXXXXXXX.zip -Algorithm SHA256
Get-Content .\OnkoFlow-department-vX.Y.Z-XXXXXXXXXXXX.zip.sha256
```

Oba zobrazené SHA-256 otisky musí být stejné. Název obsahuje verzi aplikace a prvních
12 znaků Git commitu, takže lze přesně dohledat nasazený build.

### Náhradní postup: lokální sestavení

Požadavky:

- Git;
- Node.js `20.9.0` nebo novější;
- lokální kopie repozitáře;
- žádné Node.js ani jiné instalace nejsou potřeba na nemocničních stanicích.

V PowerShellu:

```powershell
git clone https://github.com/AtecHEvolutioN/onkoflow-oncology-mockup.git
Set-Location .\onkoflow-oncology-mockup
npm ci
npm run typecheck
npm run lint
npm run build:department
```

Výsledkem je adresář `out`. Obsahuje stejné statické HTML, CSS a JavaScript a
nevyžaduje Node.js server.

## 3. Zkopírujte pouze aplikaci

Z rozbaleného ZIPu zkopírujte jeho **obsah** do:

```text
\\share4.uvn.cz\gyn\OnkoFlow\app
```

Soubor `index.html` tedy musí skončit přímo jako
`\\share4.uvn.cz\gyn\OnkoFlow\app\index.html`, ne v další vnořené složce.

Pokud používáte náhradní lokální build, z kořene repozitáře spusťte v PowerShellu:

```powershell
$AppTarget = "\\share4.uvn.cz\gyn\OnkoFlow\app"
robocopy .\out $AppTarget /E
if ($LASTEXITCODE -gt 7) { throw "Kopírování aplikace selhalo: $LASTEXITCODE" }
```

Příkaz záměrně nekopíruje ani nemaže `OnkoFlow\data`. Nepoužívejte cíl
`\\share4.uvn.cz\gyn\OnkoFlow` a nepoužívejte `/MIR` nad nadřazenou složkou.

Po kopírování musí existovat:

```text
\\share4.uvn.cz\gyn\OnkoFlow\app\index.html
```

## 4. Otevřete aplikaci na nemocniční stanici

1. Otevřete Microsoft Edge.
2. Otevřete soubor
   `\\share4.uvn.cz\gyn\OnkoFlow\app\index.html`.
3. Aplikace má začít na kartě **Datové úložiště** a musí zobrazit
   **DEPARTMENT POC**.
4. Zkontrolujte hodnoty `Protokol`, `Bezpečný kontext`, `Directory picker` a
   `IndexedDB`.

Pokud se nenačte vzhled nebo JavaScript, statické spuštění přímo z UNC cesty v dané
konfiguraci Edge nefunguje. Nepokračujte k pacientskému úložišti.

## 5. Připojte testovací datovou složku

1. Klikněte na **Připojit datovou složku**.
2. Ve Windows dialogu vyberte přesně
   `\\share4.uvn.cz\gyn\OnkoFlow\data`.
3. Aplikace nejprve připojí složku pro čtení. Pokud zobrazí
   **Vyžaduje oprávnění**, klikněte na **Povolit přístup** a potvrďte zápis.
4. Klikněte na **Spustit úplný test**.

Test vytvoří dva soubory s náhodným názvem začínajícím `.onkoflow-`, provede čtení,
zápis, změnu obsahu, smazání a sekvenční simulaci konfliktu revizí. Soubory má na
konci odstranit.

Za úspěch považujte pouze stav, kdy je všech 12 kontrol zelených a v `data` nezůstal
žádný diagnostický soubor.

## 6. Ověřte obnovení přístupu

1. Zavřete všechna okna Edge.
2. Znovu otevřete `app\index.html`.
3. Pokud Edge oprávnění neuchoval, aplikace musí nabídnout **Povolit přístup**.
4. Po povolení spusťte celý test znovu.

Directory handle může být zapamatován, ale prohlížeč může po uzavření všech karet
znovu vyžadovat oprávnění. To je očekávané bezpečnostní chování, nikoli důvod pro
lokální kopii databáze.

## 7. Opakujte na druhém počítači

Proveďte kroky 4–6 alespoň na dvou pracovních stanicích, které budou OnkoFlow reálně
používat. Sekvenční test konfliktu pouze ověřuje logiku `expectedRevision`; neprokazuje
atomicitu nahrazení souboru ani chování při skutečně souběžném zápisu přes SMB.

Další implementační fáze může začít až po zaznamenání:

- verze Edge na obou stanicích;
- výsledku všech 12 kontrol;
- zda fungovalo obnovení directory handle;
- zda po testu nezůstaly dočasné soubory;
- případných názvů a textů chyb.

## Co dělat při chybě

- `Bezpečný kontext = NE` nebo `Directory picker = NE`: zastavit. Nezapínat skryté
  browserové flags a nepoužívat náhradní lokální databázi.
- `NotAllowedError`: zkontrolovat, že výběr a žádost o oprávnění vznikly přímo po
  kliknutí uživatele.
- `AbortError` po potvrzení výběru: prohlížeč odmítl složku nebo požadované
  oprávnění. Ověřit zvlášť prázdnou lokální testovací složku; nejde automaticky o
  chybu SMB cesty.
- `NotFoundError`: ověřit dostupnost SMB a přesný výběr `data`.
- `NoModificationAllowedError` nebo `SecurityError`: ověřit práva Windows/SMB a
  omezení Edge.
- chyba zápisu, změny nebo smazání: nepokračovat k pacientským datům.
- zbylý `.onkoflow-*` soubor: zaznamenat chybu a ručně jej odstranit až po ověření,
  že jde skutečně o diagnostický soubor.

## Technická poznámka

File System Access API vyžaduje bezpečný kontext a uživatelské gesto. Standard
Secure Contexts doporučuje považovat `file:` URL za potenciálně důvěryhodné, ale
výslovně dovoluje prohlížeči zvolit přísnější chování. Proto je test na konkrétním
ÚVN Edge/SMB prostředí nepřeskočitelný.

Primární technické zdroje:

- https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- https://w3c.github.io/webappsec-secure-contexts/
- https://nextjs.org/docs/app/guides/static-exports
