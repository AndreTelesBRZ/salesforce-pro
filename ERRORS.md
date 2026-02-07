# Registro de erros observados

Este log reúne os problemas relatados durante a sessão para facilitar o acompanhamento das correções necessárias.

| Item | Fonte | Descrição | Status |
| --- | --- | --- | --- |
| 1 | Salesforce → Django | Requisições para `https://apiforce.../api/...` são rejeitadas com `{"detail":"Token ausente ou inválido"}` porque falta o header `X-App-Token` correto e o JWT emitido pelo FastAPI `/auth/login`. | _Pendente (Salesforce precisa adquirir e reutilizar o JWT e subir o `X-App-Token` do `.env.edson`)._ |
| 2 | Salesforce → Django | APIs expostas pelo FastAPI/Django retornam `401`/`500` sem o cabeçalho CORS (`Access-Control-Allow-Origin`), impedindo que o browser aceite a resposta (erro “CORS Missing Allow Origin”). | _Pendente (backend FastAPI/Django deve permitir o origin do app)._
| 3 | Frontend React | `crypto.randomUUID` não disponível em todos os ambientes; gera erro no checkout local. | _Resolvido (agora usamos `createOrderUUID()` com fallback)._
| 4 | Sincronização de dados | Falta de barra de progresso dificultava identificar etapas; hoje foi adicionada para refletir percentuais por estágio. | _Resolvido (a barra indica produtos/clientes/inadimplência e reinicia no sucesso)._

