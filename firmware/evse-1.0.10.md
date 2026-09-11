# EVSE 1.0.10 — alvo OTA de desenvolvimento

Preparado a pedido de Pedro Harenza em 11/09/2026 para publicação diretamente na `main` web. O usuário confirmou a base USB 1.0.9 no dashboard com perfil `development` e boot `passed`.

| Campo | Valor |
| --- | --- |
| Arquivo | [`evse-1.0.10.bin`](evse-1.0.10.bin), somente aplicação |
| Descritor | Projeto `EVSE`, versão `1.0.10` |
| Build | `pio run -e esp32dev_ota_development`; `EVSE_OTA_SKIP_HARDWARE_CHECKS=ON` |
| Origem | `feature/ota-update`; commit-base `e65fc2264f0727dfdc2cfd4be1ce2586a6da994c` mais alterações locais não commitadas |
| Rastreabilidade | Diff dos arquivos rastreados em `.pio/release-1.0.10-source.patch`, SHA-256 `fdb37be9e8bb7f32623dc33b9a26a0ca2a4bb82503afed540cc4224b1920dc16`; documentação diagnóstica e dois headers de testes ainda não rastreados não integram esse patch nem a aplicação. Fontes não publicadas nesta operação |
| Ferramentas | PlatformIO 6.2.0; espressif32 6.12.0; ESP-IDF 5.5.0; Xtensa GCC 14.2.0+20241119; esptool 4.9.0 |
| Tamanho | 1.168.480 bytes |
| SHA-256 completo | `77decaf2fdac728844d5b323b1ab9262342cab3612c22d6bd254314ffcd1c0c8` |
| Hardware / layout | ESP32, flash 16 MiB, dois slots OTA de 6 MiB |
| RAM estática | 46.004 / 327.680 bytes (14,0%) |
| Aplicação / slot | 1.168.079 / 6.291.456 bytes (18,6%) |
| Responsável | Pedro Harenza |

## Comportamento e validação

Mantém a implementação da base 1.0.9: histórico cheio reutiliza o registro concluído e confirmado mais antigo; operações ativas e resultados não entregues são protegidos. A deduplicação cobre somente os registros ainda armazenados. Mantém diagnósticos mbedTLS nível 1, buffer TLS de 16 KiB, logs de heap/progresso e motivos de recusa. Não é uma nova correção do erro TLS `-0x7100`; a causa continua sob investigação na bancada.

O perfil de desenvolvimento dispensa checks físicos de OTA/boot, mas mantém funções locais essenciais. Exige boot aprovado e Force Charge desabilitado para OTA; saída comandada aberta durante atualização, certificados validados e rollback habilitado. Não representa aceite do conjunto de produção.

Build aprovado em 29,13 segundos, sem avisos nesta recompilação. Perfil, TLS, descritor, partições e configurações efetivas de aplicação/bootloader conferidos. Verificador web local aprovou tamanho, versão, ESP32/16 MiB e integridade. 20 testes de versão/partições aprovados nesta preparação; a mesma implementação passou em 270 testes na base 1.0.9, incluindo falhas de armazenamento/energia durante reutilização. Nesta preparação mudam somente versão e documentação.

Nome ausente no histórico Git e URL retornando HTTP 404 antes da publicação. Binários anteriores preservados como histórico imutável.

## Verificação HTTPS

URL: [evse-1.0.10.bin](https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.10.bin).

Verificação remota pendente do deploy.

## Ensaio 1.0.9 → 1.0.10

Manter base 1.0.9, perfil `development`, boot `passed` e Force Charge desabilitado. Informar versão `1.0.10` e a URL acima no dashboard. Capturar o serial desde o comando até conclusão/recusa/falha, incluindo `OTA_DIAG`, `OTA_SERVICE`, `mbedtls`, `esp-tls-mbedtls` e `HTTP_CLIENT`.

Se houver sucesso, conferir `running_version=1.0.10`, `ota_profile=development`, `boot_validation=passed` e configuração preservada. Se houver falha, guardar as mensagens diagnósticas antes de repetir. Nenhum comando MQTT ou flash USB foi executado nesta publicação; a validação na placa permanece pendente.
