# Integracao n8n

Base local da API:

```text
http://localhost:3000/api/n8n
```

Todas as rotas exigem o token configurado em `backend/.env`:

```text
x-n8n-token: VALOR_DE_N8N_WEBHOOK_TOKEN
```

Tambem funciona com:

```text
Authorization: Bearer VALOR_DE_N8N_WEBHOOK_TOKEN
```

## Testar conexao

```http
GET /api/n8n/health
```

## Criar ou atualizar contato

```http
POST /api/n8n/contacts/upsert
```

```json
{
  "rootPhone": "5599999999999",
  "name": "Cliente Teste",
  "phone": "5511999999999",
  "source": "import",
  "status": "open"
}
```

## Registrar mensagem ou evento

Use quando o n8n precisar apenas gravar historico no sistema.

```http
POST /api/n8n/messages/register
```

```json
{
  "rootPhone": "5599999999999",
  "name": "Cliente Teste",
  "phone": "5511999999999",
  "direction": "incoming",
  "channel": "whatsapp",
  "content": "Cliente pediu atendimento pelo fluxo do n8n",
  "metadata": {
    "workflow": "lead-whatsapp"
  }
}
```

## Enviar WhatsApp

Use quando o n8n precisar disparar uma mensagem pela Evolution API configurada no projeto.

```http
POST /api/n8n/messages/send
```

```json
{
  "rootPhone": "5599999999999",
  "name": "Cliente Teste",
  "phone": "5511999999999",
  "content": "Ola! Recebemos sua solicitacao e ja vamos te atender.",
  "metadata": {
    "workflow": "boas-vindas"
  }
}
```

## Alterar status do ticket

Status aceitos: `open`, `paused`, `resolved`.

```http
POST /api/n8n/tickets/status
```

```json
{
  "rootPhone": "5599999999999",
  "phone": "5511999999999",
  "status": "resolved"
}
```

## Modelo de workflow no n8n

1. Crie um node `Webhook` ou `Schedule Trigger`.
2. Adicione um node `HTTP Request`.
3. Configure `Method` como `POST`.
4. Use uma das URLs acima.
5. Em `Headers`, envie `x-n8n-token`.
6. Em `Body`, envie JSON.

Para automacoes de producao, mantenha o n8n na mesma rede do backend ou publique o backend com HTTPS e firewall.
