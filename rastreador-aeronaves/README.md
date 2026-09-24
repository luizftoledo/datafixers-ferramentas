# Rastreador de aeronaves

Site estático em `/rastreador-aeronaves/` e dois proxies Cloudflare Pages Functions. A análise e a montagem do ZIP acontecem no navegador.

## Atualizar bases estáticas

```sh
python3 rastreador-aeronaves/scripts/build_hexdb.py
```

O script registra a hora de geração e a URL de cada fonte. Ele inclui matrículas brasileiras, mantém o mundo inteiro se o JSON comprimido ficar abaixo de 5 MB e preserva pistas privadas brasileiras no catálogo de aeroportos. Os dois JSON são publicados com o site. O arquivo `BRIEF_rastreador.md` é ignorado pelo Git.

## Fontes e proxy

- `/api/aeronave/trace?source=lol|adsbx&day=AAAA-MM-DD&hex=abcdef`: só constrói URLs históricas permitidas. `ENABLE_ADSBX` fica em `functions/api/aeronave/config.js`.
- `/api/aeronave/rab?file=records.jsonl.gz|metadata.json`: só acessa os dois arquivos do dashboard Data Fixers, que reproduz o RAB/ANAC.
- A resposta é repassada em stream. O cache de borda dura 30 dias para dias históricos e 10 minutos para hoje. Erros de origem ficam visíveis na interface.

O hash SHA-256 corresponde aos bytes recebidos pelo navegador; se a origem entregar gzip, o arquivo no ZIP mantém a extensão `.gz`. O manifesto inclui URL, horário de coleta, hash, versão e parâmetros do algoritmo.

## Verificação local

```sh
node rastreador-aeronaves/scripts/test_core.mjs
npx wrangler pages dev .
```

O teste automatizado cobre a costura de duas fontes, a identificação de KFLL e SBBR, horário, validação do proxy e `Referer` para ADS-B Exchange. A verificação com trace real deve ser feita na interface ou no Pages dev com acesso às origens externas.
