# Projeto Taxímetro Digital

## Proposta de Modernização do Sistema de Taxímetro para o Transporte Público Individual de Passageiros

---

### 1. Resumo Executivo

O presente projeto propõe a substituição dos taxímetros físicos atualmente instalados nos veículos de transporte individual de passageiros (táxis) por um **aplicativo digital homologado**, operado em smartphone ou tablet padronizado, com cálculo de tarifa baseado em GPS, bandeiramento automático e configuração tarifária remota e segura.

---

### 2. Problemas do Sistema Atual

#### 2.1. Inviabilidade Técnica com Veículos Elétricos

O taxímetro tradicional exige instalação física com fios e sensores conectados à transmissão do veículo. Com o avanço dos **veículos elétricos e híbridos** no Brasil, esse modelo se torna inviável, pois:

- A instalação de fios e sensores viola a garantia de fábrica dos veículos
- Carros elétricos não possuem transmissão mecânica convencional para acoplamento de sensor
- A interferência no sistema elétrico do veículo pode causar danos e perda de cobertura contratual
- Não há padronização entre fabricantes para interface com taxímetros físicos

#### 2.2. Alto Custo de Manutenção

Equipamentos físicos apresentam:

- **Taxa de falhas elevada**: componentes eletromecânicos sujeitos a vibração, temperatura e desgaste
- **Custo de reposição**: equipamentos com preço entre R$ 1.500 e R$ 4.000 por unidade
- **Manutenção recorrente**: média de 2 a 3 intervenções técnicas por ano por equipamento
- **Paralisações**: veículo precisa ficar fora de operação durante reparos

#### 2.3. Burocracia e Custo nas Alterações Tarifárias

Toda alteração de tarifa — reajuste anual, bandeirada, frações — exige:

1. Deslocamento físico do veículo até oficina credenciada pelo INMETRO
2. Abertura lacre do taxímetro
3. Programação manual por técnico especializado
4. Nova lacração e verificação metrológica

**Custo estimado por alteração**: entre R$ 80 e R$ 250 por veículo, considerando mão de obra, deslocamento e parada operacional.

**Impacto em frota de 10.000 veículos**: R$ 800 mil a R$ 2,5 milhões **por alteração tarifária**.

---

### 3. Solução Proposta: Aplicativo Taxímetro Digital

#### 3.1. Arquitetura do Sistema

| Componente | Descrição |
|---|---|
| **Aplicativo Mobile** | Interface do taxista com GPS, cálculo de tarifa, bandeira 1 e 2 |
| **Servidor de Configuração** | Plataforma web para órgãos reguladores e oficinas credenciadas |
| **API de Sincronização** | Comunicação segura entre app e servidor |
| **Banco de Dados** | Registro de corridas, configurações e auditoria |

#### 3.2. Funcionalidades

- **Cálculo automático de tarifa** com base em bandeirada e frações configuráveis
- **Bandeira 1 e 2** automáticas por horário/dia da semana ou manual
- **Navegação GPS integrada** com entrada de endereço de destino
- **Display do valor da corrida** em tempo real no formato legal
- **Proteção por senha** para acesso às configurações (6 dígitos)
- **Acesso Master remoto** para órgãos reguladores e INMETRO
- **Alteração tarifária remota** sem necessidade de deslocamento do veículo
- **Registro de auditoria** de todas as alterações de configuração
- **Tempo de espera** configurável (horas parado)

#### 3.3. Segurança e Conformidade

- Senha criptografada para acesso às configurações
- Comunicação com servidor via HTTPS com certificação digital
- Assinatura digital das configurações recebidas do servidor master
- Log de alterações com timestamp e identificação do autor
- Proteção contra adulteração local (configurações validadas pelo servidor)

---

### 4. Benefícios

#### 4.1. Para o Poder Público e Órgãos Reguladores

| Benefício | Impacto |
|---|---|
| **Alteração tarifária remota** | Atualização de toda frota em minutos, sem custo operacional |
| **Auditoria total** | Registro de todas as corridas e configurações para fiscalização |
| **Padronização** | Todos os veículos com mesma base tecnológica e critérios de cálculo |
| **Redução de fraudes** | Impossibilidade de adulteração local do equipamento |
| **Economia** | Eliminação de custos com lacres, verificações e deslocamentos |

#### 4.2. Para o Taxista

| Benefício | Impacto |
|---|---|
| **Zero manutenção** | Sem equipamento físico para quebrar ou desgastar |
| **Sem custo de instalação** | Basta um smartphone padrão |
| **Compatibilidade total** | Funciona em qualquer veículo, inclusive elétricos |
| **Navegação integrada** | GPS e mapa auxiliam na corrida |
| **Garantia do veículo preservada** | Sem fios ou sensores instalados |

#### 4.3. Para o Passageiro

| Benefício | Impacto |
|---|---|
| **Transparência** | Valor visível durante toda a corrida |
| **Rastreamento** | Possibilidade de compartilhar trajeto |
| **Recibo digital** | Comprovante de corrida por e-mail ou SMS |

---

### 5. Simulação Financeira

#### Cenário: Frota de 10.000 veículos, 2 alterações tarifárias/ano

| Item | Sistema Físico | Sistema Digital | Economia |
|---|---|---|---|
| **Instalação inicial** | R$ 25.000.000 (R$ 2.500/un.) | R$ 0 (smartphone do taxista) | R$ 25.000.000 |
| **Manutenção anual** | R$ 6.000.000 | R$ 200.000 (servidores/suporte) | R$ 5.800.000 |
| **Alterações tarifárias/ano** | R$ 4.000.000 | R$ 50.000 | R$ 3.950.000 |
| **Custo 5 anos** | ~R$ 65.000.000 | ~R$ 1.250.000 | **R$ 63.750.000** |

---

### 6. Próximos Passos Sugeridos

1. **Homologação pelo INMETRO** do aplicativo como sistema de medição tarifária
2. **Regulamentação municipal/estadual** para uso do taxímetro digital
3. **Implementação de projeto piloto** com frota reduzida (50-100 veículos)
4. **Avaliação metrológica** comparativa entre sistema digital e físico
5. **Expansão gradual** para toda a frota

---

### 7. Considerações Finais

O taxímetro digital baseado em aplicativo não é apenas uma evolução tecnológica — é uma **necessidade** diante do cenário de eletrificação da frota automotiva brasileira. Países como Reino Unido, Alemanha e Japão já adotam sistemas similares com sucesso.

Este projeto oferece:

- **Economia** de dezenas de milhões para o sistema
- **Agilidade** na implementação de políticas tarifárias
- **Sustentabilidade** ao viabilizar táxis elétricos
- **Segurança** metrológica superior ao sistema atual
- **Modernização** do serviço público de transporte

---

**Contato para apresentação técnica:**

_[Nome do responsável pelo projeto]_

_[Telefone / E-mail]_

_[Data]_
