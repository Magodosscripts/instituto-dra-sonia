# API para n8n — Criar Agendamento

## Endpoint

| Ambiente   | URL                                              |
|------------|--------------------------------------------------|
| Local      | `http://localhost:3000/api/agendamentos`          |
| Produção   | `https://SEU_PROJETO.vercel.app/api/agendamentos` |

## Método

`POST`

## Headers

```
Content-Type: application/json
```

Se você configurou `N8N_API_KEY` nas variáveis de ambiente, inclua também:

```
x-api-key: VALOR_DA_SUA_N8N_API_KEY
```

Se `N8N_API_KEY` não estiver configurada, o endpoint aceita requisições sem autenticação.

## Body (JSON)

```json
{
  "nome": "Maria Silva",
  "telefone": "11999999999",
  "procedimento": "Botox",
  "queixa": "Rugas na testa",
  "data": "2026-05-10",
  "horario": "14:00",
  "observacoes": "Lead veio do WhatsApp",
  "origem": "n8n"
}
```

### Campos

| Campo        | Tipo   | Obrigatório | Descrição                                   |
|--------------|--------|-------------|---------------------------------------------|
| `nome`       | string | **Sim**     | Nome completo da paciente                   |
| `telefone`   | string | Não         | Telefone / WhatsApp                         |
| `procedimento`| string | Não        | Nome do serviço (ex: "Botox", "Rinomodelação") |
| `queixa`     | string | Não         | Queixa principal relatada                   |
| `data`       | string | **Sim**     | Data no formato `YYYY-MM-DD`                |
| `horario`    | string | **Sim**     | Horário no formato `HH:MM`                  |
| `observacoes`| string | Não         | Observações adicionais                      |
| `origem`     | string | Não         | Origem do lead (padrão: `"manual"`)         |

> O campo `procedimento` é comparado com a lista de serviços cadastrados.
> Se não houver correspondência exata, o valor é salvo como `servico_nome` diretamente.

## Resposta de sucesso (201)

```json
{
  "success": true,
  "agendamento": {
    "id": "uuid-gerado",
    "nome_paciente": "Maria Silva",
    "telefone_paciente": "11999999999",
    "servico_id": 2,
    "servico_nome": "Botox",
    "data_agendamento": "2026-05-10",
    "horario": "14:00",
    "status": "agendado",
    "observacoes": "Lead veio do WhatsApp",
    "queixa": "Rugas na testa",
    "origem": "n8n",
    "criado_em": "2026-05-05T12:00:00.000Z"
  }
}
```

## Resposta de erro — campo faltando (400)

```json
{
  "success": false,
  "error": "Campos obrigatórios: nome (ou nome_paciente), data (ou data_agendamento) e horario"
}
```

## Resposta de erro — horário ocupado (409)

```json
{
  "success": false,
  "error": "Horário já ocupado"
}
```

## Resposta de erro — API key inválida (401)

```json
{
  "success": false,
  "error": "API key inválida"
}
```

## Configuração no n8n

1. Adicione um nó **HTTP Request**
2. Method: `POST`
3. URL: `https://SEU_PROJETO.vercel.app/api/agendamentos`
4. Body Content Type: `JSON`
5. Body Parameters: cole o JSON de exemplo acima
6. Se usar N8N_API_KEY: em **Headers**, adicione `x-api-key` com o valor da chave

## Campos alternativos aceitos (compatibilidade)

O endpoint também aceita os nomes de campo usados pelo painel admin:

```json
{
  "nome_paciente": "Maria Silva",
  "telefone_paciente": "11999999999",
  "servico_id": 2,
  "data_agendamento": "2026-05-10",
  "horario": "14:00"
}
```
