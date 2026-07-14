# Agente de impressao EPL - Elgin L42

Este agente roda no PC Windows do balcao e recebe EPL bruto por HTTP para gravar direto na impressora via `win32print` com datatype `RAW`.

## Instalacao

1. Instale Python 3 no Windows e marque a opcao "Add python.exe to PATH".
2. Abra o PowerShell na pasta `print_agent`.
3. Instale as dependencias:

```powershell
pip install -r requirements.txt
```

## Configurar a impressora como Generic / Text Only

Este passo e obrigatorio. Se usar o driver inteligente da Elgin, ele pode reinterpretar os comandos EPL e deformar a etiqueta.

1. Abra **Configuracoes > Bluetooth e dispositivos > Impressoras e scanners**.
2. Clique em **Adicionar dispositivo**.
3. Se o Windows nao listar a impressora como desejado, clique em **Adicionar manualmente**.
4. Escolha **Adicionar uma impressora local ou de rede com configuracoes manuais**.
5. Selecione a porta USB usada pela Elgin L42, normalmente `USB001` ou `USB002`.
6. Na lista de fabricantes, escolha **Generic**.
7. Na lista de impressoras, escolha **Generic / Text Only**.
8. Defina um nome simples, por exemplo `ELGIN_L42_RAW`.
9. Finalize o assistente.
10. Abra as propriedades da impressora e confirme que ela esta apontando para a porta USB correta.

Use exatamente esse nome em `PRINT_AGENT_PRINTER_NAME`.

## Variaveis de ambiente

Defina as variaveis no Windows antes de iniciar o agente:

```powershell
setx PRINT_AGENT_PORT "9200"
setx PRINT_AGENT_TOKEN "troque-este-token"
setx PRINT_AGENT_PRINTER_NAME "ELGIN_L42_RAW"
```

Feche e abra novamente o PowerShell depois de usar `setx`.

Para testar manualmente:

```powershell
$env:PRINT_AGENT_PORT="9200"
$env:PRINT_AGENT_TOKEN="troque-este-token"
$env:PRINT_AGENT_PRINTER_NAME="ELGIN_L42_RAW"
python .\print_agent.py
```

## Registrar no Agendador de Tarefas

1. Abra o menu Iniciar e procure **Agendador de Tarefas**.
2. Clique em **Criar Tarefa...**.
3. Na aba **Geral**, informe o nome `Print Agent EPL`.
4. Marque **Executar somente quando o usuario estiver conectado**.
5. Na aba **Disparadores**, clique em **Novo...**.
6. Em **Iniciar a tarefa**, escolha **Ao fazer logon** e confirme.
7. Na aba **Acoes**, clique em **Novo...**.
8. Em **Programa/script**, selecione o `pythonw.exe`, por exemplo:

```text
C:\Users\andre\AppData\Local\Programs\Python\Python312\pythonw.exe
```

9. Em **Adicionar argumentos**, informe:

```text
print_agent.py
```

10. Em **Iniciar em**, informe o caminho completo da pasta `print_agent`.
11. Confirme em **OK**.
12. Clique com o botao direito na tarefa criada e use **Executar** para testar.

O log fica em `print_agent.log` na pasta do agente, com rotacao de ate 5 MB por arquivo.

## Testes manuais

Health check:

```powershell
curl http://127.0.0.1:9200/status
```

Envio de uma etiqueta EPL simples:

```powershell
curl -X POST http://127.0.0.1:9200/imprimir `
  -H "Authorization: Bearer troque-este-token" `
  -H "Content-Type: application/octet-stream" `
  --data-binary "N`r`nq783`r`nQ400,24`r`nA40,40,0,4,1,1,N,`"TESTE EPL`"`r`nP1`r`n"
```

Em producao, o servidor Linux chama o agente pelo IP Tailscale do PC Windows, por exemplo `http://100.x.x.x:9200`.
