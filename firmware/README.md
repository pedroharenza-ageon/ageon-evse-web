# Distribuição de firmware da POC

Este diretório recebe **somente binários de aplicação EVSE versionados, publicados por solicitação do responsável pela POC**. A inclusão do arquivo não comprova aprovação para instalação na placa; conferir o perfil e as pendências no registro de cada lançamento.

O primeiro artefato é [`evse-1.0.0.bin`](evse-1.0.0.bin), destinado à verificação de distribuição HTTPS. Seu [registro de lançamento](evse-1.0.0.md) identifica origem, hash e validações. O perfil NTC desse build permanece não confirmado e bloqueia validação de boot, carga e admissão OTA. `evse-1.1.0.bin`, usado nos exemplos abaixo, ainda não foi publicado.

## Preparar um lançamento

1. No projeto ESP32, definir uma versão estável superior à versão-base, compilar e executar suas validações. A base e a imagem de rollback devem incluir as etapas 4–8. Confirmar o perfil físico/NTCs e as condições da bancada antes do ensaio integrado.
2. Separar `.pio/build/esp32dev/evse-X.Y.Z.bin`. Não usar `bootloader.bin`, tabela de partições, arquivo mesclado para instalação serial, `.elf`, ZIP ou ponteiro Git LFS.
3. No projeto web, verificar o arquivo local (PowerShell; substituir a versão pelos dados reais):

   ```powershell
   npm run firmware:verify -- --file '../evse-esp32/.pio/build/esp32dev/evse-1.1.0.bin' --version 1.1.0
   ```

   O comando confere limite de 6 MiB, descritor EVSE/versão, identificação ESP32/16 MiB e SHA-256 anexado, e informa tamanho e SHA-256 do arquivo inteiro. `verification: local` **não comprova publicação**. Esse exame não substitui o build, verificador completo da imagem, assinatura ou validação no ESP32.
4. Copiar esse arquivo para `firmware/evse-X.Y.Z.bin` ou usar o upload de arquivos do GitHub nesse diretório. **Nunca substituir uma versão publicada nem reutilizar seu nome para bytes diferentes.** Correções recebem outra versão. Antes de copiar, conferir que o destino não existe; não usar sobrescrita forçada.
5. Registrar em `firmware/evse-X.Y.Z.md`: versão, commit completo do firmware, build/toolchain, tamanho exato, SHA-256, placa/perfil do ensaio, data, responsável e resultado da validação. Indicar explicitamente qualquer condição ainda pendente. Não incluir credenciais, dumps de NVS ou backups da placa.
6. Conferir o diff do repositório web; incluir apenas o binário escolhido e seu registro de lançamento. Com autorização de publicação, fazer o commit/push/merge para a fonte efetivamente configurada em **Settings → Pages** e aguardar o deploy. A configuração pode usar uma branch/pasta ou GitHub Actions; enviar apenas uma feature branch não comprova publicação. Ver [fontes de publicação do Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Verificar o arquivo publicado

Após o deploy, manter a cópia local original e executar:

```powershell
npm run firmware:verify -- --file './firmware/evse-1.1.0.bin' --version 1.1.0 --url 'https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin'
```

O comando faz GET HTTPS com validação TLS padrão do Node, sem redirects, cache ou desativação de certificados. Aceita somente HTTP 200, rejeita resposta textual/comprimida e exige tamanho e SHA-256 idênticos ao arquivo local. O corpo é processado incrementalmente, limitado ao tamanho esperado; há timeout de 30 segundos. `verification: published` identifica a verificação remota bem-sucedida. Guardar o relatório no registro do lançamento, incluindo data e URL final.

Não usar links `github.com/.../blob/...`, `raw.githubusercontent.com`, URLs com query, fragmento, credenciais ou nomes divergentes. A URL permitida pelo firmware é a do projeto Pages acima (porta explícita 443 também é aceita). O verificador é independente do navegador e do service worker; não envia comandos MQTT.

Se houver 404, HTML, tamanho ou hash divergente, não iniciar OTA. Conferir a fonte de publicação, deploy e caminho. Testar também que a URL de uma versão anterior continua retornando seus bytes originais e que uma versão inexistente mantém 404, sem fallback para o dashboard. O cache HTTP do GitHub não é configurável por este service worker; nomes versionados imutáveis e a comparação final são necessários.

## Regras do repositório

- Os `.bin` publicados neste diretório são arquivos deliberados de distribuição solicitados para a POC. O repositório ESP32 continua ignorando seus artefatos de build.
- `.gitattributes` marca `firmware/*.bin` como binário, sem conversão de linhas e sem filtro Git LFS.
- Não incluir `.pio/`, bootloaders, tabelas, logs, backups, segredos ou binários fictícios de teste. Os testes geram conteúdo sintético somente em memória.
- O ESP32 baixa diretamente do Pages; o service worker do navegador nunca armazena nem fornece fallback HTML para `firmware/`.
- Download completo não é confirmação da saúde do novo firmware. O resultado do teste OTA continua dependendo da etapa 11 e dos testes de falhas/rollback.
