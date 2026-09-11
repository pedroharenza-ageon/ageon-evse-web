# Distribuição de firmware da POC

**Alvo atual: [1.0.12](evse-1.0.12.md)** para a base USB 1.0.11 confirmada. Mantém buffer TLS sem redimensionamento variável, RX de 16 KiB, diagnósticos e reutilização do histórico. O próximo ensaio testa essa hipótese para a falha TLS; alvos abaixo são históricos.

**Alvo atual: [1.0.10](evse-1.0.10.md)** para a base 1.0.9 confirmada em desenvolvimento com boot aprovado. Inclui reutilização de histórico concluído/confirmado e diagnósticos TLS. Usar no próximo ensaio com captura serial; alvos mencionados abaixo são históricos.

**Alvo atual de diagnóstico: [1.0.8](evse-1.0.8.md)**, para a base USB 1.0.7 confirmada com perfil `development` e boot `passed`. Preserva a instrumentação TLS/heap/recusa; não é uma nova correção comprovada. O ensaio 1.0.5 → 1.0.6 falhou na placa. As orientações abaixo sobre alvos antigos são históricas; usar 1.0.8 no próximo ensaio e capturar os logs seriais.

Este diretório recebe **somente binários de aplicação EVSE versionados, publicados por solicitação do responsável pela POC**. A inclusão do arquivo não comprova aprovação para instalação na placa; conferir o perfil e as pendências no registro de cada lançamento.

O primeiro artefato é [`evse-1.0.0.bin`](evse-1.0.0.bin), destinado à verificação de distribuição HTTPS. Seu [registro de lançamento](evse-1.0.0.md) identifica origem, hash e validações. O perfil NTC desse build permanece não confirmado e bloqueia validação de boot, carga e admissão OTA. `evse-1.1.0.bin`, usado nos exemplos abaixo, ainda não foi publicado.

O alvo corrigido de desenvolvimento para atualizar a base USB 1.0.5 é [`evse-1.0.6.bin`](evse-1.0.6.bin). Seu [registro de lançamento](evse-1.0.6.md) informa configuração, origem, hash, correções HTTP/TLS e validações. As versões 1.0.2 e 1.0.4 permanecem como histórico imutável, mas usam o limite TLS de entrada de 8 KiB que causou interrupção do download; 1.0.2 também contém a falha de status HTTP. Não usar essas versões como alvo. As imagens de desenvolvimento dispensam checks físicos de OTA/boot para uso com ou sem potência e não representam aceite do conjunto de produção.

## Preparar um lançamento

Normal e desenvolvimento usam o mesmo descritor `EVSE` e as mesmas verificações locais/remotas abaixo, sem argumento de perfil. Registrar a configuração de checks em cada lançamento; a imagem instalada define os requisitos do próximo boot. É possível trocar de configuração por OTA com versão superior, sem exigir USB após o provisionamento inicial. Como ambos usam `evse-X.Y.Z.bin`, reservar versões distintas para quaisquer artefatos publicados com bytes diferentes. A configuração de desenvolvimento preserva a lógica normal de carga; o bloqueio do relé durante OTA é temporário.

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

O comando faz GET HTTPS com validação TLS padrão do Node, sem redirects, cache ou desativação de certificados. Solicita `Accept-Encoding: identity` para receber os bytes sem compressão; a negociação padrão do `fetch` pode fazer o Pages comprimir até um arquivo `.bin`. Aceita somente HTTP 200, rejeita resposta textual/comprimida e exige tamanho e SHA-256 idênticos ao arquivo local. O corpo é processado incrementalmente, limitado ao tamanho esperado; há timeout de 30 segundos. `verification: published` identifica a verificação remota bem-sucedida. Guardar o relatório no registro do lançamento, incluindo data e URL final.

Não usar links `github.com/.../blob/...`, `raw.githubusercontent.com`, URLs com query, fragmento, credenciais ou nomes divergentes. A URL permitida pelo firmware é a do projeto Pages acima (porta explícita 443 também é aceita). O verificador é independente do navegador e do service worker; não envia comandos MQTT.

Se houver 404, HTML, tamanho ou hash divergente, não iniciar OTA. Conferir a fonte de publicação, deploy e caminho. Testar também que a URL de uma versão anterior continua retornando seus bytes originais e que uma versão inexistente mantém 404, sem fallback para o dashboard. O cache HTTP do GitHub não é configurável por este service worker; nomes versionados imutáveis e a comparação final são necessários.

## Regras do repositório

- Os `.bin` publicados neste diretório são arquivos deliberados de distribuição solicitados para a POC. O repositório ESP32 continua ignorando seus artefatos de build.
- `.gitattributes` marca `firmware/*.bin` como binário, sem conversão de linhas e sem filtro Git LFS.
- Não incluir `.pio/`, bootloaders, tabelas, logs, backups, segredos ou binários fictícios de teste. Os testes geram conteúdo sintético somente em memória.
- O ESP32 baixa diretamente do Pages; o service worker do navegador nunca armazena nem fornece fallback HTML para `firmware/`.
- Download completo não é confirmação da saúde do novo firmware. O resultado do teste OTA continua dependendo da etapa 11 e dos testes de falhas/rollback.
