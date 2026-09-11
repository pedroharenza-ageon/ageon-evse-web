# EVSE 1.0.12 — alvo OTA de desenvolvimento com buffer TLS fixo

Preparado a pedido de Pedro Harenza em 11/09/2026 para publicação diretamente na `main` web. Base USB 1.0.11 confirmada pelo usuário com ELF `aa319f825f02a196...`, perfil `development` e boot `passed`.

| Campo | Valor |
| --- | --- |
| Arquivo | [`evse-1.0.12.bin`](evse-1.0.12.bin), somente aplicação |
| Descritor | Projeto `EVSE`, versão `1.0.12` |
| Build | `pio run -e esp32dev_ota_development`; `EVSE_OTA_SKIP_HARDWARE_CHECKS=ON` |
| Origem | `feature/ota-update`; commit-base `e65fc2264f0727dfdc2cfd4be1ce2586a6da994c` mais alterações locais não commitadas |
| Rastreabilidade | Diff dos arquivos rastreados em `.pio/release-1.0.12-source.patch`, SHA-256 `73dae158c67882b7a3893001496a26bba51c1eadb94e5d1e688b410021ac1eea`; documentação diagnóstica e dois headers de testes não rastreados estão fora desse patch e não integram a aplicação. Fontes não publicadas nesta operação |
| Ferramentas | PlatformIO 6.2.0; espressif32 6.12.0; ESP-IDF 5.5.0; Xtensa GCC 14.2.0+20241119; esptool 4.9.0 |
| Tamanho | 1.167.616 bytes |
| SHA-256 completo | `1b72741719b522077b9499312819dcc19b8668a5dd6e0c5d7c0747d76b2783f8` |
| Hardware / layout | ESP32, flash 16 MiB, dois slots OTA de 6 MiB |
| RAM estática | 46.004 / 327.680 bytes (14,0%) |
| Aplicação / slot | 1.167.207 / 6.291.456 bytes (18,6%) |
| Responsável | Pedro Harenza |

## Comportamento e validação

Preserva a implementação da base 1.0.11: `MBEDTLS_SSL_VARIABLE_BUFFER_LENGTH=false`, RX de 16 KiB, diagnóstico mbedTLS nível 1, formatação de tempo compatível com Newlib nano e reutilização de histórico concluído/confirmado. É um teste da hipótese de redimensionamento para `requesting more data than fits`; ainda não comprova correção da transferência na placa.

O perfil de desenvolvimento dispensa checks físicos de OTA/boot, mantendo funções locais essenciais. OTA exige boot aprovado e Force Charge desabilitado; mantém saída comandada aberta, certificados validados e rollback. Não representa aceite de produção.

Build aprovado em 30,39 segundos, sem avisos nesta recompilação. Perfil, configurações TLS, descritor, partições e configurações efetivas de aplicação/bootloader verificados. 20 testes de versão/partições aprovados; a mesma implementação passou em 270 testes na base 1.0.11. Esta preparação altera somente versão e documentação. Verificador web local aprovou tamanho, versão, ESP32/16 MiB e integridade.

Nome ausente no histórico Git e URL retornando HTTP 404 antes da publicação. Binários anteriores preservados como histórico imutável.

## Verificação HTTPS

URL: [evse-1.0.12.bin](https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.12.bin).

**Aprovada em 11/09/2026 às 12:52:43.382 UTC.** Publicação `fed568d287cda2f11a01717b69a75694f068ed44`; [execução do Pages](https://github.com/pedroharenza-ageon/ageon-evse-web/actions/runs/34601136127). GET HTTPS com TLS validado retornou HTTP 200, sem redirects/compressão, 1.167.616 bytes e SHA-256 `1b72741719b522077b9499312819dcc19b8668a5dd6e0c5d7c0747d76b2783f8` idênticos ao arquivo local (`verification=published`).

Às 12:52:44.886 UTC, 1.0.10 manteve seus 1.168.480 bytes e hash original `77decaf2fdac728844d5b323b1ab9262342cab3612c22d6bd254314ffcd1c0c8`.

## Ensaio 1.0.11 → 1.0.12

Manter base 1.0.11, perfil `development`, boot `passed` e Force Charge desabilitado. Informar versão `1.0.12` e a URL acima no dashboard. Capturar o serial desde o comando até conclusão/recusa/falha, incluindo `OTA_DIAG`, `OTA_SERVICE`, `mbedtls`, `esp-tls-mbedtls` e `HTTP_CLIENT`.

Se houver sucesso, conferir versão 1.0.12, perfil de desenvolvimento, boot aprovado e configurações preservadas. Se persistir `requesting more data than fits`, guardar a captura antes de outra alteração; será necessário medir a capacidade efetiva e o comprimento solicitado no ponto de erro. Nenhum comando MQTT ou flash USB foi executado nesta publicação.
