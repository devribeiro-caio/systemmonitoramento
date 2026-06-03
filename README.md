# Sistema Monitoramento

Sistema MVC em Node.js, Express e MongoDB para monitorar atendimentos de colaboradores vinculados a um telefone raiz.

## Estrutura

```text
backend/   API Node.js, Express, MongoDB, MVC e autenticação
frontend/  Interface web do sistema
```

## Como rodar

1. Instale as dependencias:

```bash
cd backend
npm install
```

2. Configure o arquivo `backend/.env`.

3. Inicie o servidor:

```bash
npm run dev
```

## Rotas principais

- `GET /api/health`: verifica se a API esta no ar.
- `POST /api/auth/register`: cria um colaborador.
- `POST /api/auth/login`: autentica e retorna token JWT.
- `GET /api/users/me`: dados do usuario logado.
- `POST /api/users`: cria colaborador, apenas admin/supervisor.
- `GET /api/users`: lista colaboradores, apenas admin/supervisor.
- `POST /api/attendances`: registra atendimento.
- `GET /api/attendances`: lista atendimentos com filtros.
- `GET /api/attendances/summary`: resumo dos atendimentos.
- `POST /api/pabx/wide-voice/events`: recebe um evento de chamada do Wide Voice.
- `POST /api/pabx/wide-voice/import`: importa chamadas em lote.
- `GET /api/pabx/calls`: lista chamadas do PABX, apenas admin/supervisor.
- `GET /api/pabx/calls/summary`: resumo de chamadas do PABX, apenas admin/supervisor.

Envie o token JWT no header:

```http
Authorization: Bearer seu_token
```

Eventos/importacoes do Wide Voice devem enviar o header:

```http
x-pabx-token: token_configurado_no_backend
```

Exemplo de evento PABX:

```json
{
  "rootPhone": "(11) 94509-2300",
  "callId": "wide-voice-123",
  "callerNumber": "11999999999",
  "destinationNumber": "1144418838",
  "extension": "203",
  "direction": "incoming",
  "status": "answered",
  "startedAt": "2026-06-02T16:30:00.000Z",
  "endedAt": "2026-06-02T16:35:00.000Z",
  "durationSeconds": 300
}
```

Observacao: o primeiro usuario cadastrado em `/api/auth/register` vira `admin`.
Depois disso, cadastros publicos viram `collaborator`; novos usuarios com permissao
devem ser criados por `/api/users`.

## Frontend

O app web fica em `frontend/` e e servido pelo Express na raiz:

```bash
cd backend
npm run dev
```

Depois acesse:

```text
http://localhost:3000
```
