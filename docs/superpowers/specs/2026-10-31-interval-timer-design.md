# Interval Timer: design

## Intenção

PWA para treino de luta. O timer nativo do iPhone conta só um período, sem número de rounds nem descanso, o que obriga a reiniciá-lo manualmente. Este app configura uma vez e conduz o treino inteiro por som, tocando na caixa de som junto com a música, sem precisar tocar no celular.

Faz uma coisa só: controlar rounds, tempo de round e tempo de descanso.

## Cenário de uso

iPhone conectado a uma caixa de som, com Spotify tocando em segundo plano. O usuário abre o app pelo ícone na Tela de Início, ajusta os valores, toca em Iniciar e vai treinar. Os sons indicam as mudanças de fase. A tela é consultada de longe.

## Objetivos

- Configurar número de rounds, tempo de round e tempo de descanso. Os tempos são iguais para todos os rounds.
- Tocar avisos sonoros por cima da música, sem pausar nem mudar o volume dela.
- Exibir fase, round atual e tempo restante, legíveis de longe.
- Funcionar offline depois de instalado.

## Fora de escopo nesta versão

Contas, histórico, presets, tempos diferentes por round e botão de pular fase. Decisões do usuário nesta conversa ou aceitas por ele na revisão de escopo.

## Anti-objetivos

O app falhou, mesmo funcionando tecnicamente, se:

- parar ou interromper a música;
- exigir toque no celular entre o início e o fim do treino;
- exigir olhar a tela para saber a fase;
- atrasar visivelmente em relação ao tempo real.

## Comportamento

### Sequência

1. Tocar em Iniciar abre contagem de 3s para o usuário chegar à posição.
2. Ao fim da contagem, toca o som de início de round e começa o round 1.
3. Round: som de aviso quando faltam 10s; som de fim de round ao zerar.
4. Descanso: som de aviso quando faltam 10s; som de início de round ao zerar.
5. Depois do último round não há descanso; o treino termina.

Duração total exibida: `rounds × round + (rounds − 1) × descanso`. Exemplo: 5 × 3:00 com 1:00 de descanso = 19 min.

### Saída do app durante o treino

Decisão do usuário: se o app for para segundo plano, como ao trocar música no Spotify ou receber ligação, o timer não pausa e segue pelo relógio. Sons podem não tocar nesse período. Na volta, o app recupera o áudio e a tela ligada e mostra a fase correta, avançando sobre as fases perdidas. Sons atrasados não tocam. Se o treino tiver terminado nesse período, mostra o fim do treino.

### Telas

Configuração:

- Controles de − e + para rounds, round e descanso.
- Total calculado.
- Lembrete fixo para desligar o modo silencioso.
- Botão Iniciar.
- Os últimos valores usados ficam salvos no aparelho.

Treino (fundo escuro, número enorme):

- Rótulo da fase: ROUND em verde, DESCANSO em azul.
- No round: "2 de 5". No descanso: "Próximo: round 3 de 5".
- Tempo restante como `m:ss`, em destaque.
- Botões Pausar e Parar.

Referência visual aprovada: `telas-v2` em `.superpowers/brainstorm/`.

## Restrições técnicas validadas

Testado em iPhone real com Spotify tocando na caixa, via página descartável:

- `navigator.audioSession.type = 'ambient'` com Web Audio toca por cima da música, sem mudar o volume. Funcionou no app aberto pelo ícone da Tela de Início.
- O tipo `playback` para a música. Não usar.
- Com o modo silencioso ligado, o som `ambient` não toca. O motivo foi confirmado em teste. O app não detecta esse estado, daí o lembrete fixo.

Ainda não validado: manter a tela ligada com Wake Lock. O teste rodou sem HTTPS, e o recurso exige HTTPS.

Decisão do usuário: este é o primeiro marco da implementação. Publicar uma página mínima com HTTPS e testar no iPhone, pelo ícone da Tela de Início, antes de construir o resto. Se falhar, usar lembrete fixo para ajustar Bloqueio Automático para Nunca. Não usar vídeo escondido em loop, porque pode parar a música.

Nesse plano B, o critério de tela ligada passa a valer com o Bloqueio Automático em Nunca.

## Como será feito

Escolhas de stack propostas por Claude e aprovadas pelo usuário:

- TypeScript com Vite, sem framework.
- `vite-plugin-pwa` para service worker e manifest.
- Vitest para lógica de rounds e avisos.
- GitHub Pages para hospedagem com HTTPS e deploy a cada push.
- Sem servidor ou login; ajustes salvos em `localStorage`.
- Tempo calculado a partir do relógio do sistema, não por contagem de ticks.

## Critérios de sucesso

No iPhone, pelo ícone da Tela de Início e com Spotify tocando:

- Um treino completo roda do início ao fim sem tocar no celular.
- Todos os sons tocam nos momentos certos, e a música segue sem mudança de volume.
- A tela permanece ligada durante todo o treino.
- O app abre e funciona em modo avião depois de instalado.

## Decisões deixadas para quem construir

- Timbre dos sons, desde que aviso, fim de round e início de round sejam distinguíveis sem olhar a tela.
- Passos e limites dos controles.
- Detalhes de Pausar e Parar, tela de fim de treino e visual da contagem de 3s.
- Nome do repositório, caminho base no GitHub Pages e estratégia de atualização do service worker.
- Tons exatos de cor, ícone e nome exibido.
