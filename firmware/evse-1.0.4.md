# EVSE 1.0.4 — alvo OTA de desenvolvimento com correção HTTP

Preparado a pedido de Pedro Harenza em 10/09/2026, para publicação diretamente na `main` web e ensaio OTA a partir da base 1.0.3. O usuário confirmou essa base no dashboard com `ota_profile=development` e `boot_validation=passed` após a gravação USB.

| Campo | Valor |
| --- | --- |
| Arquivo | [`evse-1.0.4.bin`](evse-1.0.4.bin), somente aplicação |
| Descritor | Projeto `EVSE`, versão `1.0.4` |
| Build | `pio run -e esp32dev_ota_development`; `EVSE_OTA_SKIP_HARDWARE_CHECKS=ON` |
| Origem | Branch `feature/ota-update`; commit-base `e65fc2264f0727dfdc2cfd4be1ce2586a6da994c` mais alterações locais não commitadas |
| Alterações incluídas | Correção do status HTTP durante callbacks de cabeçalho e `Accept-Encoding: identity`; correção SDKCONFIG do bootloader; comandos/forçamento independentes de boot pendente/reprovado; versão 1.0.4 |
| Rastreabilidade local | `.pio/release-1.0.4-source.patch` no projeto ESP32, SHA-256 `da8d93942fd9f5fe4456c08f86f854fa51665ec676a467a1bcae014b977c4c70`; patch não publicado |
| Ferramentas | PlatformIO Core 6.2.0; espressif32 6.12.0; ESP-IDF 5.5.0; Xtensa GCC 14.2.0+20241119; esptool 4.9.0 |
| Tamanho | 1.132.272 bytes |
| SHA-256 completo | `265866f9343a3ede7943750512c762aab5cc23a95d7ce0432c6476ed67f12d99` |
| Alvo / layout | ESP32, flash de 16 MiB, dois slots OTA de 6 MiB |
| RAM | 45.988 / 327.680 bytes (14,0%) |
| Aplicação / slot | 1.131.871 / 6.291.456 bytes (18,0%); binário com 5.159.184 bytes livres |
| Responsável | Pedro Harenza |

## Correção e perfil

O ESP-IDF informa status HTTP `-1` durante os callbacks de cabeçalhos e preenche o status real somente depois deles. As versões antigas consultavam esse valor cedo demais, causando `http_error` com tamanho desconhecido em uma resposta válida. As versões corrigidas 1.0.3/1.0.4 verificam HTTP 200 durante os dados e após a abertura OTA; os cabeçalhos continuam rejeitando conteúdo textual/comprimido e a requisição pede bytes sem compressão. TLS, integridade e bloqueio de redirects permanecem ativos.

Esta imagem mantém o perfil de desenvolvimento da base 1.0.3: dispensa requisitos físicos CP/State A/GFCI/NTCs/perfil de hardware para OTA/boot, com máscara de módulos dispensados 57616; mantém configuração, armazenamento e tarefas locais essenciais. O forçamento explícito durante boot pendente/reprovado segue a política já existente; não aprova a imagem nem permite iniciar OTA. Relés permanecem comandados abertos durante a transferência e ativação. A configuração não representa aceite do conjunto de produção.

## Validação local

- Build aprovado, sem avisos nesta recompilação; descritor, versão, tamanho, partições e configurações efetivas da aplicação/bootloader aprovados, com rollback habilitado.
- Verificação web dos bytes copiados aprovada: ESP32/16 MiB, descritor `EVSE/1.0.4`, SHA-256 anexado e hash do arquivo completo.
- 20 testes de versão e partições/configuração aprovados nesta preparação. A mesma implementação corrigida passou em 260 testes locais na base 1.0.3; esta preparação altera a versão e a documentação, sem mudar a lógica HTTP. Avisos C4267/C4018 conhecidos pertencem aos testes MSVC do SDK.
- Nome ausente no histórico Git e URL final retornando HTTP 404 antes da publicação. Binários anteriores preservados.

## Verificação HTTPS

URL: [download de evse-1.0.4.bin](https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.4.bin).

**Aprovada em 10/09/2026 às 20:49:28.529 UTC.** Publicação na `main` em `14c6a2f08280483ea7b8b9389abd93237913d5d6`; [deploy do Pages concluído com sucesso](https://github.com/pedroharenza-ageon/ageon-evse-web/actions/runs/34528423710). GET HTTPS retornou HTTP 200, sem redirects/compressão, com TLS validado, tamanho de 1.132.272 bytes e SHA-256 `265866f9343a3ede7943750512c762aab5cc23a95d7ce0432c6476ed67f12d99` idênticos ao arquivo local; resultado `verification=published`.

Às 20:49:28.934 UTC, a versão anterior 1.0.2 também manteve HTTP 200, 1.132.208 bytes e hash original `9d457e0359a14dc18376b14513b1bf6268cc21daf940acd950d8f64c6869c7ed`. Essa verificação confirma preservação do histórico, não corrige seu downloader antigo.

Comando para repetir a conferência dos bytes publicados:

```powershell
node tools/verify-firmware.mjs --file firmware/evse-1.0.4.bin --version 1.0.4 --url https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.0.4.bin
```

## Ensaio 1.0.3 → 1.0.4

Manter a base 1.0.3 corrigida, perfil de desenvolvimento e diagnóstico aprovado. Desabilitar Force Charge. Estados A ou E são aceitos no desenvolvimento, sujeitos aos demais critérios locais. Informar versão 1.0.4 e a URL acima no dashboard. Após iniciar, observar download, verificação, reboot e resultado `success`; conferir versão 1.0.4, perfil `development` e `boot_validation=passed`, além de configuração preservada.

A versão 1.0.2 publicada contém o downloader antigo e não deve ser alvo deste ensaio. Nenhuma atualização MQTT ou gravação de hardware foi executada para esta publicação; o ensaio real e o rollback na placa continuam pendentes. O binário é imutável: qualquer alteração recebe nova versão.
