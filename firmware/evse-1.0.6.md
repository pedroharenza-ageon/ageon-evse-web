# EVSE 1.0.6 — alvo OTA de desenvolvimento com correção TLS

Preparado a pedido de Pedro Harenza em 11/09/2026 para publicação diretamente na `main` web. O usuário confirmou a base USB 1.0.5 com `ota_profile=development` e `boot_validation=passed`.

| Campo | Valor |
| --- | --- |
| Arquivo | [`evse-1.0.6.bin`](evse-1.0.6.bin), somente aplicação |
| Descritor | Projeto `EVSE`, versão `1.0.6` |
| Build | `pio run -e esp32dev_ota_development`; `EVSE_OTA_SKIP_HARDWARE_CHECKS=ON` |
| Origem | Branch `feature/ota-update`; commit-base `e65fc2264f0727dfdc2cfd4be1ce2586a6da994c` mais alterações locais não commitadas |
| Alterações incluídas | Recepção TLS de 16 KiB e proteção de compilação; correção HTTP/Accept-Encoding; configuração do bootloader; política de comandos/forçamento durante boot pendente ou reprovado; versão 1.0.6 |
| Rastreabilidade local | `.pio/release-1.0.6-source.patch` no projeto ESP32; SHA-256 `c6ab149cdc060aa7963ca557c6f617b508985d279ec6f32cd02f1709f9cc97f3`; patch não publicado |
| Ferramentas | PlatformIO Core 6.2.0; espressif32 6.12.0; ESP-IDF 5.5.0; Xtensa GCC 14.2.0+20241119; esptool 4.9.0 |
| Tamanho | 1.132.272 bytes |
| SHA-256 completo | `c35eba0a63b9eea75361529deb8015d8d2df213083c85cefdb07b5b3b61b409e` |
| Alvo / layout | ESP32, flash de 16 MiB, dois slots OTA de 6 MiB |
| RAM estática | 45.988 / 327.680 bytes (14,0%) |
| Aplicação / slot | 1.131.871 / 6.291.456 bytes (18,0%) |
| Responsável | Pedro Harenza |

## Correção e perfil

O Pages envia registros TLS com até 16 KiB de conteúdo. O limite anterior de 8 KiB causou erro `-0x7100` e `download_interrupted` na bancada. Esta imagem preserva a correção da base 1.0.5: `CONFIG_MBEDTLS_SSL_IN_CONTENT_LEN=16384`, TLS com certificado validado e rejeição de limites menores na compilação. As versões 1.0.2 e 1.0.4 permanecem imutáveis, mas não devem ser usadas como alvo, pois restaurariam o cliente defeituoso.

O perfil de desenvolvimento dispensa checks físicos de CP/State A/GFCI/NTCs/perfil de hardware para OTA/boot, mantendo configuração, armazenamento e tarefas locais essenciais. OTA ainda exige diagnóstico aprovado e Force Charge desabilitado; mantém relés comandados abertos durante atualização. Não representa validação do conjunto de produção. O aumento do buffer pode consumir aproximadamente 8 KiB adicionais de heap por conexão TLS; medir heap livre/mínimo na bancada.

## Validação local

- Build aprovado em 35,49 segundos, sem avisos nesta recompilação. Perfil de desenvolvimento e buffer TLS de 16 KiB conferidos na configuração gerada.
- Partições, descritor, versão, tamanho e configurações efetivas de aplicação/bootloader aprovados; rollback habilitado em ambos.
- 20 testes de versão e partições/configuração aprovados. A mesma implementação passou em 262 testes na preparação 1.0.5; esta preparação altera somente versão e documentação. Os builds completos anteriores registraram aviso preexistente de função não utilizada e os testes MSVC, avisos do SDK C4267/C4018.
- Verificação local web aprovada: ESP32/16 MiB, descritor `EVSE/1.0.6`, SHA-256 anexado e hash completo.
- Nome ausente no histórico Git e URL retornando HTTP 404 antes da publicação. Binários anteriores preservados.

## Verificação HTTPS

URL: [download de evse-1.0.6.bin](https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.6.bin).

**Aprovada em 11/09/2026 às 11:47:30.795 UTC.** Publicação na `main` em `674873069fa90cd5d643875358b0c6a8199b6f5c`; [deploy do Pages concluído com sucesso](https://github.com/pedroharenza-ageon/ageon-evse-web/actions/runs/34595644640). GET HTTPS retornou HTTP 200, sem redirects/compressão, com TLS validado, tamanho de 1.132.272 bytes e SHA-256 `c35eba0a63b9eea75361529deb8015d8d2df213083c85cefdb07b5b3b61b409e` idênticos ao arquivo local; resultado `verification=published`.

Às 11:47:33.531 UTC, 1.0.4 também manteve seus 1.132.272 bytes e hash original `265866f9343a3ede7943750512c762aab5cc23a95d7ce0432c6476ed67f12d99`. Isso confirma preservação do histórico, não corrige seu downloader.

```powershell
node tools/verify-firmware.mjs --file firmware/evse-1.0.6.bin --version 1.0.6 --url https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.6.bin
```

## Ensaio 1.0.5 → 1.0.6

Com a base 1.0.5, perfil `development` e boot `passed`, desabilitar Force Charge e informar versão `1.0.6` e a URL acima no dashboard. Acompanhar download, verificação, reboot e resultado `success`; confirmar `running_version=1.0.6`, `ota_profile=development`, `boot_validation=passed` e configurações preservadas.

Nenhuma gravação de hardware ou comando MQTT foi executado nesta publicação. Transferência completa, resultado na placa e testes de falhas/rollback continuam pendentes. O binário é imutável.
