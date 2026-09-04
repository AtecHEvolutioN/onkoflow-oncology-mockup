# OnkoFlow: offline departmental application

Tento postup instaluje offline verzi OnkoFlow 0.6.0. Pacientské záznamy se ukládají
přímo do uživatelem vybrané složky `data`; aplikace při prvním spuštění vytvoří
podsložky `patients`, `audit` a `backups`.

Offline balíček spustí statickou aplikaci na důvěryhodné lokální adrese
`http://127.0.0.1:8787`. Nepotřebuje internet, Git, instalaci Node.js ani PowerShell.

Na spravovaných stanicích, kde správce blokuje CMD nebo `node.exe`, použijte pro
diagnostiku variantu PWA níže. Zákaz správce neobcházejte.

## Bezpečnostní hranice

- GitHub a Vercel obsahují pouze zdrojový kód, nikoli obsah vybrané datové složky.
- Do IndexedDB se ukládá pouze browserový `FileSystemDirectoryHandle`.
- Klinický obsah se ukládá jen do vybrané složky `data`.
- Aplikace a `data` jsou oddělené. Aktualizace aplikace se nesmí dotknout `data`.
- Lokální server poslouchá pouze na `127.0.0.1` a zpřístupňuje jen soubory v `app`.
- Úspěšný test na jednom počítači není důkazem bezpečné víceuživatelské databáze.

## Varianta A: Edge PWA bez CMD

Tato varianta potřebuje internet jen pro první načtení a aktualizaci aplikace:

1. V Microsoft Edge otevřete
   `https://onkoflow-oncology-mockup-andrej.vercel.app/`.
2. Počkejte, až se vpravo dole zobrazí **Offline režim připraven**.
3. V Edge otevřete **Nastavení a další → Aplikace → Nainstalovat OnkoFlow**.
   Edge může místo toho zobrazit instalační ikonu přímo v adresním řádku.
4. Zavřete původní kartu a spusťte OnkoFlow z nabídky Start, plochy nebo
   `edge://apps`.
5. Odpojte internet nebo vypněte Wi-Fi a ověřte, že se rozhraní znovu otevře.
6. Na kartě **Datové úložiště** připojte pouze prázdnou testovací složku a spusťte
   úplnou diagnostiku.

PWA ukládá do cache pouze rozhraní aplikace. Pacientská data do cache ani na Vercel
neukládá; File System Access pracuje přímo s uživatelem vybranou složkou. Kód však
pochází z veřejného HTTPS originu a service worker se
může při připojení aktualizovat. Pro klinické použití je nutné schválení IT, řízení
aktualizací a bezpečnostní kontrola.

Pokud Edge instalaci PWA nenabídne nebo ji správce zakáže, bez zásahu IT zbývá pouze
online HTTPS aplikace. Nemocniční řešení pak vyžaduje interní HTTPS hosting nebo
správcem schválenou a podepsanou aplikaci.

## Varianta B: lokální balíček, pokud CMD není blokováno

## 1. Připravte testovací datovou složku

Budoucí sdílené úložiště je:

```text
\\share4.uvn.cz\gyn\OnkoFlow\data
```

Pro první test vytvořte prázdnou lokální složku s názvem `data`. Teprve po jejím
úspěšném otestování použijte samostatnou prázdnou testovací složku na SMB. Živou
datovou složku ani skutečné záznamy zatím nepoužívejte.

Ověřte, že váš běžný nemocniční účet může v testovací SMB složce:

1. vytvořit obyčejný textový soubor;
2. otevřít jej;
3. změnit jej;
4. smazat jej.

Pokud selže už tento Windows test, nepokračujte. Jde o oprávnění SMB, nikoli o chybu
OnkoFlow.

## 2. Stáhněte offline Windows ZIP

Na pracovní stanici není potřeba vývojové prostředí:

1. Otevřete
   [nejnovější GitHub Release](https://github.com/AtecHEvolutioN/onkoflow-oncology-mockup/releases/latest).
2. V části **Assets** stáhněte
   `OnkoFlow-offline-Windows-vX.Y.Z-XXXXXXXXXXXX.zip`.
3. Stáhněte také stejně pojmenovaný soubor s příponou `.sha256`.
4. Rozbalte **celý** ZIP do lokální složky, například
   `C:\Users\Public\OnkoFlow`.

Po rozbalení musí být v kořeni:

```text
OnkoFlow\
├── Start-OnkoFlow.cmd
├── BUILD-INFO.txt
├── app\
├── launcher\
├── runtime\
└── THIRD-PARTY-LICENSES\
```

Balíček nesmí obsahovat složku `data`.

Volitelná kontrola integrity v PowerShellu:

```powershell
Get-FileHash .\OnkoFlow-offline-Windows-vX.Y.Z-XXXXXXXXXXXX.zip -Algorithm SHA256
Get-Content .\OnkoFlow-offline-Windows-vX.Y.Z-XXXXXXXXXXXX.zip.sha256
```

Oba SHA-256 otisky musí být stejné. Název obsahuje verzi aplikace a prvních 12 znaků
Git commitu.

## 3. Spusťte aplikaci bez internetu

1. Dvakrát klikněte na `Start-OnkoFlow.cmd`.
2. Ponechte otevřené konzolové okno **OnkoFlow - lokalni aplikace**.
3. Launcher spustí server pouze na tomto počítači a automaticky otevře Edge na:

   `http://127.0.0.1:8787/`

Lokální server povoluje jen čtení zabalených souborů aplikace metodami GET/HEAD.
Datovou složku přes HTTP nezpřístupňuje a Content Security Policy blokuje síťové
požadavky stránky.

Pokud port `8787` používá jiná aplikace, launcher zobrazí chybu. Port neměňte nahodile:
stabilní origin umožňuje Edge poznat aplikaci a obnovit uložený directory handle.

Zavřením konzolového okna se lokální server zastaví. Opětovné spuštění během již
běžící instance pouze otevře existující aplikaci.

## 4. Zkontrolujte prostředí

Aplikace má začít přihlašovací obrazovkou. Vyberte složku `data`, zadejte přístupové
heslo a po otevření přejděte na kartu **Datové úložiště**. Má se zobrazit
**OFFLINE PROVOZ**.
Zkontrolujte:

- `Protokol = http:`;
- `Bezpečný kontext = ANO`;
- `Directory picker = ANO`;
- `IndexedDB = ANO`;
- adresa začíná přesně `http://127.0.0.1:8787/`, nikoli `file:`.

Pokud launcher stránku spustí, ale některá z posledních tří kontrol selže,
zaznamenejte stav a nepokračujte k pacientskému úložišti.

## 5. Připojte prázdnou testovací složku

1. Klikněte na **Připojit datovou složku**.
2. Vyberte prázdnou lokální složku `data`.
3. Pokud aplikace zobrazí **Vyžaduje oprávnění**, klikněte na
   **Povolit přístup** a potvrďte zápis.
4. Klikněte na **Spustit úplný test**.

Test vytvoří dva soubory s náhodným názvem začínajícím `.onkoflow-`, provede čtení,
zápis, změnu obsahu, smazání a sekvenční simulaci konfliktu revizí. Na konci je musí
odstranit.

Za úspěch považujte pouze všech 12 zelených kontrol a žádný zbývající diagnostický
soubor. Potom lze stejný test zopakovat s prázdnou testovací složkou na SMB.

## 6. Ověřte obnovení přístupu

1. Zavřete všechna okna Edge a konzolové okno launcheru.
2. Znovu spusťte `Start-OnkoFlow.cmd`.
3. Pokud Edge oprávnění neuchoval, aplikace nabídne **Povolit přístup**.
4. Po povolení spusťte celý test znovu.

Directory handle může být zapamatován, ale Edge může po uzavření všech oken znovu
vyžadovat oprávnění. To je očekávané bezpečnostní chování.

## 7. Opakujte na druhém počítači

Proveďte kroky 3–6 alespoň na dvou pracovních stanicích, které budou OnkoFlow reálně
používat. Sekvenční test konfliktu pouze ověřuje logiku `expectedRevision`; neprokazuje
atomicitu nahrazení souboru ani chování při skutečně souběžném zápisu přes SMB.

Zaznamenejte:

- verzi Edge na obou stanicích;
- výsledek všech 12 kontrol;
- zda fungovalo obnovení directory handle;
- zda po testu nezůstaly dočasné soubory;
- případné názvy a texty chyb.

## Aktualizace aplikace

1. Zavřete konzolové okno lokálního serveru.
2. Stáhněte nový `OnkoFlow-offline-Windows-...zip` a ověřte SHA-256.
3. Rozbalte jej do nové lokální složky.
4. Spusťte nový `Start-OnkoFlow.cmd`.

Datová složka leží mimo balíček, takže výměna aplikace ji nemaže ani nepřepisuje.
Starý balíček ponechte do ověření nové verze jako možnost návratu. Protože origin
`http://127.0.0.1:8787` zůstává stejný, uložený directory handle může zůstat dostupný;
Edge může přesto znovu vyžádat oprávnění.

## Co dělat při chybě

- `Bezpečný kontext = NE` nebo `Directory picker = NE`: zastavit. Nezapínat skryté
  browserové flags.
- `NotAllowedError`: výběr a oprávnění musí následovat přímo po kliknutí uživatele.
- `AbortError`: Edge odmítl složku nebo bylo okno výběru zrušeno. Ověřte nejprve
  prázdnou lokální složku.
- `NotFoundError`: ověřte dostupnost SMB a správnou testovací složku.
- `NoModificationAllowedError` nebo `SecurityError`: ověřte práva Windows/SMB a
  omezení Edge.
- chyba zápisu, změny nebo smazání: nepokračovat k pacientským datům.
- zbylý `.onkoflow-*` soubor: zaznamenejte chybu a ručně jej odstraňte až po ověření,
  že jde skutečně o diagnostický soubor.

## Technická poznámka

File System Access API vyžaduje bezpečný kontext a uživatelské gesto. Loopback origin
`http://127.0.0.1` je podle Secure Contexts potenciálně důvěryhodný a umožňuje
directory picker bez internetového hostingu. Přímé `file:` spuštění v konkrétní
konfiguraci ÚVN výběr adresáře nepředalo, proto jej tento balíček nepoužívá.

Primární technické zdroje:

- https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- https://www.w3.org/TR/secure-contexts/
- https://nextjs.org/docs/app/guides/static-exports
