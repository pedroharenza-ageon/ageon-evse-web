# Dashboard EVSE — POC de recursos remotos

Aplicação estática de depuração, com telemetria e comandos MQTT. A etapa 10 acrescenta atualização manual na página de detalhes de cada EVSE; as modificações da etapa 9 organizam a distribuição, os caminhos do Pages e o cache. O firmware ESP32 não foi modificado nessas etapas web. A publicação e a verificação de um binário real no Pages ainda estão pendentes.

Este painel usa o broker público definido para a POC (`broker.hivemq.com`, WebSocket TLS na porta 8884). O transporte não autentica o operador nem substitui as verificações de segurança no ESP32. A aplicação de produção e a evolução de autenticação/assinatura permanecem fora desta entrega.

## Executar localmente

Usar Node.js 22 ou superior:

```sh
npm ci
node tests/browser/server.js
```

Abrir `http://127.0.0.1:4173/ageon-evse-web/`. Esse servidor local reproduz o prefixo do Pages. Abrir o dashboard normalmente conecta ao broker configurado; os testes automatizados descritos abaixo substituem essa conexão por simulação.

Para iniciar OTA, o navegador precisa de contexto seguro (HTTPS ou localhost), `crypto.randomUUID`, Web Locks e `localStorage` acessível. A coordenação entre abas usa um lock por dispositivo e persiste a tentativa antes da publicação. A API coordena abas da mesma origem, conforme a [documentação de Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API); outros navegadores/computadores continuam sujeitos à deduplicação e admissão do firmware.

## Atualização manual

1. Publicar e verificar previamente o binário versionado no Pages, conforme o [roteiro de distribuição](firmware/README.md). O exemplo `1.1.0` não comprova que esse arquivo esteja disponível.
2. Abrir os detalhes do EVSE correto. A versão atual vem do heartbeat, não do valor digitado pelo operador.
3. Aguardar MQTT conectado, confirmação da assinatura OTA, heartbeat recente, `boot_validation=passed` e Estado A informado na conexão atual. Descoberta retida com `online` não basta para habilitar o botão.
4. Informar uma versão estritamente superior, no formato `MAJOR.MINOR.PATCH`, e a URL completa, por exemplo:

   `https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin`

5. Clicar em **Iniciar atualização**. A página gera um UUID, grava a correlação e publica um comando. Aguardar a aceitação e os estados do EVSE.
6. Somente `success` da operação correlacionada, com a versão executada correspondente, indica conclusão validada. `rebooting` e 100% transferido permanecem pendentes.

Versões estáveis têm até 31 caracteres, sem prefixo `v`, sufixos ou zeros iniciais. A comparação usa componentes decimais sem perda de precisão. A URL deve corresponder literalmente ao host e caminho acima; `:443` explícito também é aceito. Credenciais, query, fragmento, travessia, codificação de caminho, outro repositório ou nome de arquivo divergente são recusados antes da publicação.

O ESP32 continua responsável por State A, relés abertos, validação da versão/imagem, prazos, ativação e rollback. O perfil NTC do firmware atual ainda não foi confirmado; esse firmware reporta diagnóstico não aprovado e mantém a admissão OTA bloqueada. Os ensaios integrados dependem do provisionamento e da bancada.

## Contrato MQTT e reconciliação

| Fluxo | Tópico | QoS | Retain |
| --- | --- | --- | --- |
| Comando manual | `evse/{device_id}/command/ota_update` | 1 | `false` |
| Operação aceita / resultado | `evse/{device_id}/status/ota` | 1 | Publicado pelo firmware com `true` |
| Rejeição de comando | Mesmo tópico de status | 1 | `false` |

```json
{
  "command": "ota_update",
  "version": "1.1.0",
  "url": "https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin",
  "request_id": "2c9dd9ea-5d7c-4ca1-8f8e-8acdf03f64de"
}
```

O cliente usa MQTT 3.1.1 (`mqttVersion: 4`). Publicação e subscrição OTA solicitam QoS 1 explicitamente. A configuração segue a [API do Paho](https://eclipse.dev/paho/files/jsdoc/Paho.MQTT.Client.html). Uma chamada de publicação não representa aceitação do EVSE; duplicatas de QoS 1 são esperadas e usam o mesmo identificador.

- A identidade do dispositivo vem do tópico exato; o formato atual do firmware é o MAC com 12 dígitos hexadecimais maiúsculos. O payload não pode escolher outro dispositivo.
- `scope=command` mostra uma rejeição sem substituir uma operação já aceita, inclusive no caso de uma duplicata com o mesmo ID. `scope=operation` acompanha `accepted`, `downloading`, `verifying`, `rebooting`, `success` e `failed`.
- Bytes/progresso desconhecidos usam `null`. A página exibe indicador indeterminado e não calcula sucesso pela barra. Erros aparecem pelo código do firmware; rollback inclui a versão efetivamente informada pelo EVSE.
- Resultados de outro ID/dispositivo não concluem a tentativa selecionada. Status retido anterior aparece identificado separadamente. Estados terminais conhecidos não regridem por progresso atrasado; uma falha de autoteste pode receber o detalhamento posterior de rollback.
- Recarga e reconexão preservam os IDs em `ageon-evse-ota:v1:{device_id}`. O dashboard mantém as páginas, um cliente e um timer de reconexão, reinscreve os tópicos e solicita telemetria inicial. Ele não cria/publica outra tentativa OTA automaticamente; o transporte pode retransmitir um pacote QoS 1 pendente.
- Falta de resposta ou desconexão mantém resultado **desconhecido**, sem sucesso/falha inventados. Uma tentativa sem resultado continua bloqueando novos envios, mesmo após recarga. Não há botão de reinstalação, downgrade, cancelamento remoto ou descarte silencioso dessa correlação.
- Payload vazio limpa a identificação retida e a exibição de um resultado terminal aprendido somente por retenção. Conserva tentativas locais e histórico necessário para rejeitar regressões; não declara falha nem libera uma tentativa pendente.
- Falha de armazenamento ou histórico inválido impede novos envios. Tentativas pendentes não são expulsas do histórico para abrir espaço.

## Limites experimentais do cliente

| Parâmetro | Valor |
| --- | --- |
| Comando / URL / versão | 512 / 128 / 31 bytes, conforme firmware |
| Status OTA recebido | Até 1.024 bytes |
| Tamanho de imagem informado | Até 6 MiB, conforme slot do firmware |
| Heartbeat recente | Menos de 30 segundos |
| Sem novo status | Após 30 segundos, mostrar resultado desconhecido; não expirar a tentativa |
| Atualização visual / nova conexão MQTT | 1 segundo / tentativa a cada 5 segundos |
| Abertura MQTT / confirmação da subscrição OTA | 15 segundos |
| Histórico local | Reduzir a 24 registros quando possível, preservando foco, retenção e pendências; limite absoluto de 32 |

Os prazos visuais são escolhas experimentais para a POC, não limites finais medidos em bancada. Eles não alteram os prazos nem o journal do firmware. A versão corrente aguarda o próximo heartbeat após reboot; um resultado retido antigo não substitui essa telemetria.

## Validação

```sh
npm run check
npm run test:browser
```

Em 10/09/2026: **49 testes Node aprovados** (32 de OTA e 17 de distribuição), sintaxe dos arquivos JavaScript e `manifest.json` válidos, e **17 testes de navegador aprovados** no Edge headless (12 de dashboard desktop/mobile e 5 de distribuição com service worker real). Cobrem envio único, versão/URL, QoS/retenção, dois dispositivos, duas abas com Web Locks reais, persistência/reload, reconexão, silêncio, rejeições, progresso atrasado, rollback, limpeza e falhas de armazenamento. Incluem teclado, largura de 320 px, instalação/migração de cache, falha parcial de deploy, modo offline e resposta de firmware independente de caches antigos.

Playwright é uma dependência apenas de desenvolvimento, fixada em `package-lock.json`. O navegador padrão é Edge instalado; para usar Chromium do Playwright, instalar com `npx playwright install chromium` e definir `OTA_TEST_BROWSER=chromium` no ambiente. Os relatórios e capturas ficam em `test-results/`, ignorado pelo Git.

O servidor atende apenas em loopback e sob `/ageon-evse-web/`. Playwright inicia esse servidor com `--distribution-tests`, que habilita fixtures virtuais, seleção de deploy anterior/atual/incompleto e substitui dependências externas por mocks locais. Sem essa opção, o servidor de desenvolvimento serve os arquivos normais e o dashboard conecta ao broker configurado. A suíte OTA bloqueia service workers; a suíte de distribuição instala e atualiza o worker real. Paho/Chart.js são simulados e conexões externas bloqueadas. Binários sintéticos existem somente em memória, não em `firmware/`.

O verificador local também foi executado sobre o artefato existente `evse-1.0.0.bin`: **1.131.648 bytes**, SHA-256 `5916a84aa00c257a6c154cd5465b6f17155a388bf1c272aad819f9c4df5aa176`, resultado `verification: local`. O arquivo permaneceu no diretório de build ESP32. Não houve publicação no Pages, verificação HTTPS de um lançamento remoto, negociação MQTT real, novo build ESP32 ou gravação de hardware.

## Caminhos e cache — etapa 9

```text
index.html
css/                 style.css, ota.css
js/                  módulos e scripts do dashboard
firmware/            README de publicação; binários adicionados manualmente
sw.js                worker na raiz do escopo
offline.html
manifest.json
tools/               verificador de firmware
tests/               validação local
```

O manifesto usa `id` e `scope` relativos (`./`) e `start_url=./?mode=pwa`. Imports JS permanecem relativos entre módulos; HTML referencia `css/` e `js/`. O worker permanece na raiz para controlar `/ageon-evse-web/`; `.nojekyll` permite servir os arquivos estáticos sem processamento Jekyll. A fonte de publicação do Pages deve ser conferida em Settings → Pages antes do deploy; não foi alterada por esta implementação.

- A versão visível e o cache são **1.6.7**. Ao mudar um recurso local, incrementar `VERSION` em `sw.js` e sincronizar a versão exibida. O cache instala o conjunto completo de HTML, CSS, JS, manifesto e imagens antes de ativar; uma falha de recurso não substitui o worker anterior. A duração das operações de instalação/ativação é vinculada a `waitUntil`, conforme a [API de service workers](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil).
- O namespace inclui o prefixo do projeto. Limpeza remove somente caches desse namespace; em caches legados `dashboard-v*`, remove somente entradas dentro deste projeto, preservando outros projetos na mesma origem. Nunca consulta globalmente todos os caches para responder uma requisição.
- `firmware/` sempre usa rede, `cache: no-store` e redirects recusados. Não é incluído no precache, não usa cache HTTP nem CacheStorage e nunca recebe HTML do dashboard como fallback. Sem rede, retorna 503 textual; arquivo ausente mantém 404 da rede, que pode ter uma página de erro própria do servidor.
- Para a navegação da raiz/`index.html`, uma consulta à rede com prazo de 15 s confirma disponibilidade; o HTML vem do mesmo conjunto de recursos instalado. Sem rede, mostra `offline.html`, sem controles MQTT. As dependências externas continuam exigindo rede; não se promete operação completa offline. Outros caminhos não recebem fallback de dashboard.
- A ativação não recarrega a página automaticamente. A próxima navegação/recarga usa o novo conjunto; a tentativa OTA persistida permanece correlacionada. A verificação real de migração no Pages continua parte do aceite de publicação.

Para verificar um binário local ou comparar uma URL publicada com o original:

```powershell
npm run firmware:verify -- --file './firmware/evse-1.1.0.bin' --version 1.1.0
npm run firmware:verify -- --file './firmware/evse-1.1.0.bin' --version 1.1.0 --url 'https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin'
```

Esses comandos são somente leitura: não copiam, publicam ou instalam firmware. O modo remoto mantém validação TLS e compara tamanho/SHA-256 sem passar pelo service worker. O [roteiro em `firmware/README.md`](firmware/README.md) define nomes imutáveis, registro de lançamento e validação após deploy. Nenhum `.bin` de exemplo foi adicionado; escolher e publicar um lançamento específico continua pendente de solicitação. O perfil físico e o ensaio integrado da etapa 11 também continuam pendentes.

## Organização desta entrega

- `js/ota-protocol.js`: validação do contrato e evolução de estados, sem DOM ou transporte.
- `js/ota-controller.js`: admissão no cliente, correlação, persistência e coordenação entre abas.
- `js/ota-panel.js`, `css/ota.css`, `index.html`: formulário e apresentação acessível dos resultados.
- `js/mqtt-message-handler.js`, `js/mqtt-manager.js`: integração com mensagens, subscrições e reconexão.
- `tools/verify-firmware.mjs`, `firmware/README.md`: validação local/remota e procedimento de distribuição.
- `tests/`: testes sem acesso ao EVSE e servidor de desenvolvimento.

O plano completo permanece em `../OTA_IMPLEMENTATION_PLAN.md`, fora dos dois repositórios, na localização solicitada pelo usuário. As etapas web foram implementadas na branch `feature/ota-dashboard`; não incluem alterações no repositório ESP32 nem o arquivo preexistente `PROJECT_NOTES.md`.
