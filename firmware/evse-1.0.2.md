# EVSE 1.0.2 — firmware de desenvolvimento para ensaio OTA

Publicação solicitada por Pedro Harenza em 10/09/2026, diretamente na branch `main` do projeto web. Alvo do ensaio: atualizar por OTA a controladora cuja versão-base `1.0.1`, perfil `development` e `boot_validation=passed` foram confirmados pelo usuário no dashboard.

| Campo | Valor |
| --- | --- |
| Arquivo | [`evse-1.0.2.bin`](evse-1.0.2.bin), somente aplicação |
| Versão / projeto no descritor | `1.0.2` / `EVSE` |
| Configuração | `esp32dev_ota_development`; `EVSE_OTA_SKIP_HARDWARE_CHECKS=ON` |
| Origem do firmware | Branch `feature/ota-update`, commit-base `e65fc2264f0727dfdc2cfd4be1ce2586a6da994c` **mais alterações locais não commitadas** |
| Alterações locais incluídas | Correção de SDKCONFIG do bootloader, política de comandos/forçamento durante boot pendente ou reprovado, testes/documentação associados e versão 1.0.2 |
| Rastreabilidade local | Patch capturado em `.pio/release-1.0.2-source.patch` no projeto ESP32; SHA-256 `3a34fda7122b6f2431a2ca3a4146ab6c724632cf18272217edadbb46aaa1f771`; não publicado junto ao binário |
| Build | 10/09/2026, Windows, `pio run -e esp32dev_ota_development` |
| Ferramentas | PlatformIO Core 6.2.0; espressif32 6.12.0; ESP-IDF 5.5.0; Xtensa GCC 14.2.0+20241119; esptool 4.9.0 |
| Tamanho exato | 1.132.208 bytes |
| SHA-256 do arquivo completo | `9d457e0359a14dc18376b14513b1bf6268cc21daf940acd950d8f64c6869c7ed` |
| Alvo / flash / partições | ESP32; flash de 16 MiB; dois slots OTA de 6 MiB |
| RAM | 45.988 / 327.680 bytes (14,0%) |
| Aplicação / slot | 1.131.807 / 6.291.456 bytes (18,0%); binário com 5.159.248 bytes livres |
| Responsável | Pedro Harenza |

## Perfil e comportamento

Firmware de desenvolvimento com ou sem placa de potência. Dispensa CP/State A, GFCI, perfil físico e NTCs dos critérios físicos de OTA/boot; mantém requisitos locais de configuração, armazenamento e tarefas essenciais. O heartbeat esperado após a instalação contém `running_version=1.0.2`, `ota_profile=development`, `ota_hardware_checks=false` e `boot_skipped_modules=57616`.

Mudanças de estado e `force_charge` explícito são aceitos com validação pendente/reprovada. O forçamento pode acionar a saída nessa condição, preservando estado/permissões, passagem por zero e bloqueios de manutenção OTA/falha de hardware latente. Mantém a depuração existente de CP e a dispensa do autoteste GFCI pré-acionamento quando forçado. Desabilitar o forçamento restaura o bloqueio de saída do boot. A carga automática e uma nova OTA continuam exigindo diagnóstico aprovado; forçar carga não confirma uma imagem. O rollback reserva e comanda abertura da saída antes de solicitar reboot.

A bancada informada é a controladora USB, sem potência, com CP real próximo de 100 mV; GFCI, driver do relé e dois NTCs estão na potência ausente. A aprovação de boot de desenvolvimento não valida o conjunto de produção. Esta publicação não grava a placa nem inicia comandos MQTT.

## Validações locais

- Build de desenvolvimento aprovado, sem avisos nesta recompilação; descritor, versão, layout, tamanho e configurações efetivas de aplicação/bootloader conferidos. Rollback habilitado em ambos os projetos gerados.
- Verificador web aprovado para os bytes copiados: ESP32/16 MiB, projeto `EVSE`, versão 1.0.2, tamanho e SHA-256 anexado/arquivo completo.
- 20 testes de versão e partições/configuração aprovados nesta revisão. A mesma implementação, antes da mudança exclusiva de versão, passou em 258 testes locais; os avisos conhecidos C4267/C4018 do SDK pertencem aos testes MSVC.
- Antes de publicar: `main` sincronizada com `origin/main`, nome ausente no histórico Git e URL final retornando HTTP 404. `evse-1.0.0.bin` permanece inalterado.

## Verificação HTTPS

URL final: [download de evse-1.0.2.bin](https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.2.bin).

**Aprovada em 10/09/2026 às 20:32:12.431 UTC.** Publicação na `main` pelo commit `6309b90017c85717bdb70e8bad02e70e6966dd4c`; o [deploy do Pages](https://github.com/pedroharenza-ageon/ageon-evse-web/actions/runs/34526787774) terminou com sucesso. GET HTTPS retornou HTTP 200, sem redirecionamento ou compressão, com TLS validado, 1.132.208 bytes e SHA-256 idêntico ao arquivo local.

```json
{
  "file": "evse-1.0.2.bin",
  "version": "1.0.2",
  "project": "EVSE",
  "size_bytes": 1132208,
  "sha256": "9d457e0359a14dc18376b14513b1bf6268cc21daf940acd950d8f64c6869c7ed",
  "url": "https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.2.bin",
  "verification": "published",
  "verified_at": "2026-09-10T20:32:12.431Z"
}
```

A versão anterior 1.0.0 também foi verificada por HTTPS às 20:32:12.844 UTC: HTTP 200, 1.131.648 bytes e hash original `f60a67a64c2c6433c960f536f5ffbefe542472f0e30569ae962c27d1d82b189a` preservados. Para repetir a verificação de 1.0.2:

```powershell
node tools/verify-firmware.mjs --file firmware/evse-1.0.2.bin --version 1.0.2 --url https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.2.bin
```

## Ensaio na placa

Com base 1.0.1 em `development` e diagnóstico aprovado, desabilitar Force Charge e enviar pelo painel OTA a versão `1.0.2` com a URL acima. Estados A ou E são aceitos pela política de desenvolvimento, desde que os demais critérios locais sejam atendidos. Confirmar resultado MQTT `success`, versão 1.0.2, perfil de desenvolvimento e `boot_validation=passed` após reboot. A atualização real, preservação de configuração e recuperação por rollback ainda precisam de evidências na placa.

O arquivo publicado é imutável; qualquer novo build com bytes diferentes exige outra versão.
