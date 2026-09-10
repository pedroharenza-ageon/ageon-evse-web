# EVSE 1.0.0 — artefato para verificação de distribuição

Publicação solicitada por Pedro Harenza em 10/09/2026 para verificar a distribuição de firmware no GitHub Pages. Este artefato conserva o perfil físico não confirmado; o ensaio OTA na placa permanece pendente.

| Campo | Valor |
| --- | --- |
| Arquivo | [`evse-1.0.0.bin`](evse-1.0.0.bin), somente aplicação |
| Versão / projeto no descritor | `1.0.0` / `EVSE` |
| Commit do firmware | `46ddee26431297789feb98b55f91f014a9bfbf73` |
| Branch de origem | `feature/ota-update`; árvore rastreada limpa antes e depois do build |
| Build | 10/09/2026, Windows, `pio run`, ambiente `esp32dev`, modo release |
| PlatformIO | Core 6.2.0; plataforma `espressif32 @ 6.12.0` |
| SDK / compilador | ESP-IDF 5.5.0 (`framework-espidf @ 3.50500.0`); Xtensa GCC 14.2.0+20241119 |
| Gerador de imagem | esptool 4.9.0, conforme saída do build |
| Tamanho exato | 1.131.648 bytes |
| SHA-256 do arquivo completo | `f60a67a64c2c6433c960f536f5ffbefe542472f0e30569ae962c27d1d82b189a` |
| Alvo / flash | ESP32, cabeçalho de 16 MiB; bancada identificada como ESP32-D0WD-V3 revisão 3.1 |
| Partições do build | Dois slots OTA de 6 MiB; layout verificado dentro de 16.777.216 bytes |
| RAM | 45.988 / 327.680 bytes (14,0%) |
| Aplicação / slot | 1.131.251 / 6.291.456 bytes (18,0%); binário cabe com 5.159.808 bytes livres |
| Perfil de saúde | `confirmed=false`, `required_ntcs=3` (máscara NTC1 + NTC2), limites brutos ainda não confirmados |
| Responsável | Pedro Harenza |

## Validações locais

- `pio run`: aprovado; validações pós-build de descritor, tamanho, configuração e partições aprovadas. Único aviso de compilação observado: função preexistente `_save_session_to_storage` não utilizada em `EVSE_cm.c:224`.
- `esptool image_info` (4.11.0 instalado para inspeção): seis segmentos, checksum e hash anexado válidos.
- `node tools/verify-firmware.mjs --file ./firmware/evse-1.0.0.bin --version 1.0.0`: descritor EVSE/1.0.0, ESP32/16 MiB, tamanho e SHA-256 aprovados. A cópia para este diretório preservou os bytes do build.
- Antes da publicação, a URL final retornou HTTP 404 e o histórico Git não continha esse nome. O hash histórico de outro build local 1.0.0 não identifica este arquivo; aquele build não foi publicado.

## Verificação HTTPS

URL final: [download de evse-1.0.0.bin](https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.0.bin).

**Aprovada em 10/09/2026 às 17:06:36.703 UTC (14:06:36.703 em Brasília).** O commit web `e3a0160f8d4fde0bf84feecef159a3e3f4b9e48f` foi publicado na `main`; o [deploy do Pages](https://github.com/pedroharenza-ageon/ageon-evse-web/actions/runs/34505891961) terminou com sucesso. O GET na URL final retornou HTTP 200, sem redirects ou compressão, com TLS validado, 1.131.648 bytes e SHA-256 idêntico ao arquivo local.

```json
{
  "file": "evse-1.0.0.bin",
  "version": "1.0.0",
  "project": "EVSE",
  "size_bytes": 1131648,
  "sha256": "f60a67a64c2c6433c960f536f5ffbefe542472f0e30569ae962c27d1d82b189a",
  "url": "https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.0.bin",
  "verification": "published",
  "verified_at": "2026-09-10T17:06:36.703Z"
}
```

A negociação padrão do Node recebeu uma resposta comprimida e foi corretamente recusada. O verificador passou a solicitar `Accept-Encoding: identity`; a recusa de conteúdo comprimido permanece ativa e a suíte Node passou com 50 testes, incluindo regressão dessa negociação. O caminho não publicado `/firmware/evse-0.0.0.bin` retornou HTTP 404. Não existe versão anterior publicada para comparar; preservar este arquivo e repetir a comparação quando houver outro lançamento. O usuário confirmou que o dashboard implantado carrega corretamente; isso não comprova um teste específico de migração de cache antigo no site público.

Para repetir a verificação:

```powershell
npm run firmware:verify -- --file './firmware/evse-1.0.0.bin' --version 1.0.0 --url 'https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.0.bin'
```

## Limites de uso

O perfil não confirmado impede aprovar o diagnóstico local, habilitar carga e admitir OTA. A placa controladora ainda precisa do provisionamento inicial por USB com a tabela OTA, além da confirmação das dependências da potência e dos NTCs. Nenhum hardware foi gravado para esta publicação.

Este arquivo não demonstra boot, atualização ou rollback na placa. Para um ensaio integrado, preparar uma base e uma imagem-alvo com perfil confirmado; a imagem-alvo deve ter versão superior à base. O arquivo publicado é imutável: qualquer novo build com bytes diferentes recebe outra versão e outro nome, mesmo que a alteração seja somente no perfil de hardware.
