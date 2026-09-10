# Dashboard EVSE — POC de recursos remotos

Aplicação estática de depuração, com telemetria e comandos MQTT. A etapa 10 do plano OTA acrescenta atualização manual na página de detalhes de cada EVSE. O firmware ESP32 não foi modificado nesta etapa.

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

1. Publicar e verificar previamente o binário versionado no Pages, conforme a etapa 9. O exemplo `1.1.0` não comprova que esse arquivo esteja disponível.
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

Em 10/09/2026: **32 testes de protocolo/controlador/transporte aprovados**, sintaxe dos arquivos JavaScript e `manifest.json` válidos, e **12 testes de navegador aprovados** no Edge headless com tamanhos desktop/mobile. Os testes cobrem envio único, validação de versão/URL, QoS/retenção, dois dispositivos, duas abas com Web Locks reais, persistência/reload, reconexão, silêncio, rejeições, progresso atrasado, rollback, limpeza e falhas de armazenamento. Incluem teclado e largura de 320 px.

Playwright é uma dependência apenas de desenvolvimento, fixada em `package-lock.json`. O navegador padrão é Edge instalado; para usar Chromium do Playwright, instalar com `npx playwright install chromium` e definir `OTA_TEST_BROWSER=chromium` no ambiente. Os relatórios e capturas ficam em `test-results/`, ignorado pelo Git.

O servidor de teste atende apenas em loopback e sob `/ageon-evse-web/`. A suíte de navegador substitui Paho e Chart.js e intercepta recursos externos; não conecta ao broker nem baixa firmware. O service worker é desabilitado nessa suíte. Não houve publicação no Pages, negociação MQTT real ou gravação de hardware. A versão do cache e a versão visível foram atualizadas para 1.6.6; migração completa do cache, organização `css/`, `js/`, `firmware/` e verificação do arquivo publicado pertencem à **etapa 9, ainda pendente**.

## Organização desta entrega

- `ota-protocol.js`: validação do contrato e evolução de estados, sem DOM ou transporte.
- `ota-controller.js`: admissão no cliente, correlação, persistência e coordenação entre abas.
- `ota-panel.js`, `ota.css`, `index.html`: formulário e apresentação acessível dos resultados.
- `mqtt-message-handler.js`, `mqtt-manager.js`: integração com mensagens, subscrições e reconexão.
- `tests/`: testes sem acesso ao EVSE e servidor de desenvolvimento.

O plano completo permanece em `../OTA_IMPLEMENTATION_PLAN.md`, fora dos dois repositórios, na localização solicitada pelo usuário. Esta etapa foi implementada na branch web `feature/ota-dashboard`; não inclui alterações no repositório ESP32 nem o arquivo preexistente `PROJECT_NOTES.md`.
