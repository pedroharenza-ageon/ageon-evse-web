# EVSE 1.0.8 — alvo OTA de desenvolvimento com diagnóstico

Preparado a pedido de Pedro Harenza em 11/09/2026 para publicação diretamente na `main` web. Base USB 1.0.7 confirmada pelo usuário com ELF `708e516de994f722...`, perfil `development` e boot `passed`.

| Campo | Valor |
| --- | --- |
| Arquivo | [`evse-1.0.8.bin`](evse-1.0.8.bin), somente aplicação |
| Descritor | `EVSE`, versão `1.0.8` |
| Build | `pio run -e esp32dev_ota_development`; `EVSE_OTA_SKIP_HARDWARE_CHECKS=ON` |
| Origem | `feature/ota-update`; commit-base `e65fc2264f0727dfdc2cfd4be1ce2586a6da994c` mais alterações locais não commitadas |
| Rastreabilidade | Diff dos arquivos rastreados em `.pio/release-1.0.8-source.patch`, SHA-256 `7a3ed88469663130021eddb7adaf583d5eedc55e5b047b1fdcb0b9749ed98389`; documentação diagnóstica e dois headers de testes locais ainda não rastreados não fazem parte desse patch. Nenhum deles integra a aplicação. Fontes não publicadas nesta operação |
| Ferramentas | PlatformIO 6.2.0; espressif32 6.12.0; ESP-IDF 5.5.0; Xtensa GCC 14.2.0+20241119; esptool 4.9.0 |
| Tamanho | 1.168.256 bytes |
| SHA-256 completo | `5d4aa1158802eae33fde7e25a068a813f3bdd456853ae813c529f36e88e1d0e8` |
| Hardware / layout | ESP32, flash 16 MiB, dois slots OTA de 6 MiB |
| RAM estática | 46.004 / 327.680 bytes (14,0%) |
| Aplicação / slot | 1.167.847 / 6.291.456 bytes (18,6%) |
| Responsável | Pedro Harenza |

## Finalidade e validação

Mesma instrumentação da base 1.0.7: mbedTLS nível de advertência 1, recepção TLS de 16 KiB, registros de erro/heap/progresso e motivos de recusa OTA. Não constitui nova correção do erro `-0x7100`: o ensaio anterior falhou mesmo com a base 1.0.5 correta. A próxima captura deve identificar a condição interna e a causa de `busy`.

O perfil de desenvolvimento dispensa checks físicos de OTA/boot, mantendo verificações locais essenciais. OTA exige boot aprovado e Force Charge desabilitado; mantém saída comandada aberta durante atualização. Certificados, limites, retenção, rollback e política de carga permanecem iguais à base diagnóstica. Não representa aceite do conjunto de produção.

Build aprovado em 30,05 segundos, sem avisos nesta recompilação. Perfil, TLS, descritor, layout e configurações efetivas de aplicação/bootloader verificados, com rollback habilitado. Verificador web local aprovou tamanho, versão, ESP32/16 MiB e integridade. 20 testes de versão/partições aprovados nesta preparação. Na preparação diagnóstica anterior passaram 262 testes existentes, seguidos de 33 de download e 71 de desenvolvimento após novas regressões. Avisos preexistentes dos builds completos/testes estão registrados no projeto ESP32.

Nome ausente no histórico e URL retornando HTTP 404 antes da publicação. Todos os binários anteriores são preservados como histórico imutável.

## Verificação HTTPS

URL: [evse-1.0.8.bin](https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.8.bin).

Verificação remota pendente do deploy.

## Ensaio 1.0.7 → 1.0.8

Manter base diagnóstica 1.0.7, perfil `development`, boot `passed` e Force Charge desabilitado. Informar versão `1.0.8` e a URL acima no dashboard. Capturar o serial desde o comando até conclusão/recusa/falha, incluindo `OTA_DIAG`, `OTA_SERVICE`, `mbedtls`, `esp-tls-mbedtls` e `HTTP_CLIENT`.

Em caso de sucesso, conferir versão 1.0.8, perfil de desenvolvimento, boot aprovado e configuração preservada. Se houver recusa, guardar o motivo antes de tentar novamente. Esta publicação não envia comando MQTT nem grava hardware; o teste na placa continua pendente.
